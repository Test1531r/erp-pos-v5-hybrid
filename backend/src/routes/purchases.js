import { Router } from "express";
import { Prisma } from "@prisma/client";
import dayjs from "dayjs";
import { prisma, io } from "../index.js";
import { authenticate, authorize, requireBranch } from "../middleware/auth.js";
import { money, positiveInt } from "../utils/security.js";
import { audit } from "../utils/audit.js";
import { postMovement } from "../utils/finance.js";

const router = Router();
router.use(authenticate, authorize("SUPER_ADMIN","BRANCH_MANAGER","INVENTORY_MANAGER","ACCOUNTANT"), requireBranch);
const D = (v) => new Prisma.Decimal(v);

async function supplierLedger(tx,{supplierId,branchId,type,direction,amount,referenceType,referenceId,notes}) {
  const s = await tx.supplier.findUnique({ where:{id:supplierId} });
  if(!s) throw Object.assign(new Error("المورد غير موجود"),{status:404});
  const before = D(s.balance || 0);
  const value = D(amount);
  const after = direction === "IN" ? before.add(value) : before.sub(value);
  await tx.supplier.update({ where:{id:supplierId}, data:{balance:after} });
  return tx.supplierLedger.create({data:{supplierId,branchId,type,direction,amount:value,balanceBefore:before,balanceAfter:after,referenceType,referenceId,notes:notes||null}});
}

router.get("/", async (req,res)=>{
  const rows = await prisma.purchase.findMany({where:{branchId:req.branchId},include:{supplier:{select:{id:true,name:true,balance:true}},createdBy:{select:{name:true}},items:{include:{product:{select:{name:true,sku:true}}}}},orderBy:{createdAt:"desc"},take:200});
  res.json(rows);
});

router.post("/", async (req,res)=>{
  try{
    const supplierId = String(req.body.supplierId||"");
    const items = Array.isArray(req.body.items)?req.body.items:[];
    if(!supplierId || !items.length) return res.status(400).json({error:"المورد والأصناف مطلوبان"});
    const prefix=`PO-${dayjs().format("YYYYMMDD")}`;
    const created = await prisma.$transaction(async tx=>{
      const supplier=await tx.supplier.findUnique({where:{id:supplierId}}); if(!supplier) throw Object.assign(new Error("المورد غير موجود"),{status:404});
      let subtotal=D(0); const normalized=[];
      for(const raw of items){
        const quantity=positiveInt(raw.quantity); const product=await tx.product.findUnique({where:{id:raw.productId}}); if(!product) throw Object.assign(new Error("منتج غير موجود"),{status:422});
        const unitCost=D(money(raw.unitCost,"تكلفة الشراء")); const lineTotal=unitCost.mul(quantity); subtotal=subtotal.add(lineTotal);
        normalized.push({productId:product.id,quantity,unitCost,lineTotal,imeiNumbers:Array.isArray(raw.imeiNumbers)?raw.imeiNumbers.map(String):[]});
      }
      const tax=D(money(req.body.taxAmount||0,"الضريبة")); const total=subtotal.add(tax);
      const count=await tx.purchase.count({where:{purchaseNumber:{startsWith:prefix}}});
      const purchaseNumber=`${prefix}-${String(count+1).padStart(4,"0")}`;
      const p=await tx.purchase.create({data:{purchaseNumber,supplierId,branchId:req.branchId,createdById:req.user.id,status:req.body.status==="ORDERED"?"ORDERED":"DRAFT",subtotal,taxAmount:tax,total,notes:req.body.notes||null,orderedAt:req.body.status==="ORDERED"?new Date():null,items:{create:normalized}},include:{supplier:true,items:true}});
      await supplierLedger(tx,{supplierId,branchId:req.branchId,type:"PURCHASE",direction:"IN",amount:total,referenceType:"Purchase",referenceId:p.id,notes:purchaseNumber});
      return p;
    });
    await audit(req.user,"PURCHASE_CREATE","Purchase",created.id,{purchaseNumber:created.purchaseNumber,total:String(created.total)},req.branchId);
    res.status(201).json(created);
  }catch(err){res.status(err.status||500).json({error:err.status?err.message:"تعذر إنشاء أمر الشراء"});}
});

router.post("/:id/receive", async (req,res)=>{
  try{
    const result=await prisma.$transaction(async tx=>{
      const p=await tx.purchase.findFirst({where:{id:req.params.id,branchId:req.branchId},include:{items:{include:{product:true}}}}); if(!p) throw Object.assign(new Error("أمر الشراء غير موجود"),{status:404});
      if(["RECEIVED","CANCELLED"].includes(p.status)) throw Object.assign(new Error("لا يمكن استلام هذا الأمر"),{status:409});
      const requested=new Map((req.body.items||[]).map(x=>[x.purchaseItemId,x])); let all=true;
      for(const item of p.items){
        const raw=requested.get(item.id); const qty=raw?positiveInt(raw.quantity):item.quantity-item.receivedQty; if(qty<=0) continue;
        const remaining=item.quantity-item.receivedQty; if(qty>remaining) throw Object.assign(new Error(`الكمية المستلمة أكبر من المتبقي لـ ${item.product.name}`),{status:400});
        const before=await tx.inventory.findUnique({where:{productId_branchId:{productId:item.productId,branchId:req.branchId}}});
        const qBefore=before?.quantity||0;
        await tx.inventory.upsert({where:{productId_branchId:{productId:item.productId,branchId:req.branchId}},create:{productId:item.productId,branchId:req.branchId,quantity:qty},update:{quantity:{increment:qty}}});
        await tx.stockMovement.create({data:{branchId:req.branchId,productId:item.productId,userId:req.user.id,type:"PURCHASE",quantity:qty,quantityBefore:qBefore,quantityAfter:qBefore+qty,referenceType:"Purchase",referenceId:p.id,notes:p.purchaseNumber}});
        const imeis=Array.isArray(raw?.imeiNumbers)?raw.imeiNumbers.map(String):[];
        if(item.product.hasIMEI){
          if(imeis.length!==qty) throw Object.assign(new Error(`يجب إدخال ${qty} IMEI لـ ${item.product.name}`),{status:400});
          for(const imei of imeis) await tx.productIMEI.create({data:{productId:item.productId,branchId:req.branchId,imei,status:"IN_STOCK"}});
        }
        await tx.purchaseItem.update({where:{id:item.id},data:{receivedQty:{increment:qty},imeiNumbers:{set:[...item.imeiNumbers,...imeis]}}});
        if(item.receivedQty+qty<item.quantity) all=false;
      }
      const status=all?"RECEIVED":"PARTIAL";
      return tx.purchase.update({where:{id:p.id},data:{status,receivedAt:all?new Date():p.receivedAt},include:{supplier:true,items:{include:{product:true}}}});
    });
    for(const item of result.items){const inv=await prisma.inventory.findUnique({where:{productId_branchId:{productId:item.productId,branchId:req.branchId}}});io.to(`branch:${req.branchId}`).emit("inventory:update",{productId:item.productId,branchId:req.branchId,quantity:inv?.quantity||0});}
    await audit(req.user,"PURCHASE_RECEIVE","Purchase",result.id,{status:result.status},req.branchId); res.json(result);
  }catch(err){res.status(err.status||500).json({error:err.status?err.message:"تعذر استلام أمر الشراء"});}
});

router.post("/:id/pay", async (req,res)=>{
  try{
    const amount=money(req.body.amount,"المبلغ",{allowZero:false}); const accountId=String(req.body.accountId||""); if(!accountId) return res.status(400).json({error:"اختر الحساب المالي"});
    const result=await prisma.$transaction(async tx=>{
      const p=await tx.purchase.findFirst({where:{id:req.params.id,branchId:req.branchId}}); if(!p) throw Object.assign(new Error("أمر الشراء غير موجود"),{status:404});
      const remaining=D(p.total).sub(p.paidAmount); if(D(amount).greaterThan(remaining)) throw Object.assign(new Error("الدفعة أكبر من المبلغ المتبقي"),{status:400});
      await postMovement(tx,{branchId:req.branchId,accountId,userId:req.user.id,type:"OTHER_OUT",amount,direction:"OUT",referenceType:"Purchase",referenceId:p.id,description:`سداد للمورد - ${p.purchaseNumber}`});
      await supplierLedger(tx,{supplierId:p.supplierId,branchId:req.branchId,type:"PAYMENT",direction:"OUT",amount,referenceType:"Purchase",referenceId:p.id,notes:req.body.notes});
      return tx.purchase.update({where:{id:p.id},data:{paidAmount:{increment:D(amount)}},include:{supplier:true}});
    });
    io.to(`branch:${req.branchId}`).emit("finance:update",{branchId:req.branchId}); await audit(req.user,"SUPPLIER_PAYMENT","Purchase",result.id,{amount},req.branchId); res.json(result);
  }catch(err){res.status(err.status||500).json({error:err.status?err.message:"تعذر تسجيل الدفعة"});}
});


router.post("/:id/return", async (req,res)=>{
  try{
    const items=Array.isArray(req.body.items)?req.body.items:[];
    if(!items.length)return res.status(400).json({error:"حدد أصناف المرتجع"});
    const result=await prisma.$transaction(async tx=>{
      const p=await tx.purchase.findFirst({where:{id:req.params.id,branchId:req.branchId},include:{items:{include:{product:true}},returns:{include:{items:true}}}});
      if(!p)throw Object.assign(new Error("أمر الشراء غير موجود"),{status:404});
      const prior=new Map();for(const ret of p.returns)for(const i of ret.items)prior.set(i.purchaseItemId,(prior.get(i.purchaseItemId)||0)+i.quantity);
      const map=new Map(p.items.map(i=>[i.id,i]));let total=D(0);const normalized=[];
      for(const raw of items){const src=map.get(raw.purchaseItemId);if(!src)throw Object.assign(new Error("صنف مرتجع غير صالح"),{status:422});const qty=positiveInt(raw.quantity);const available=src.receivedQty-(prior.get(src.id)||0);if(qty>available)throw Object.assign(new Error(`الكمية المرتجعة من ${src.product.name} أكبر من المتاح (${available})`),{status:422});const line=D(src.unitCost).mul(qty);total=total.add(line);const imeis=Array.isArray(raw.imeiNumbers)?raw.imeiNumbers.map(String):[];if(src.product.hasIMEI){if(imeis.length!==qty)throw Object.assign(new Error(`حدد ${qty} IMEI لـ ${src.product.name}`),{status:422});const count=await tx.productIMEI.count({where:{imei:{in:imeis},productId:src.productId,branchId:req.branchId,status:"IN_STOCK"}});if(count!==imeis.length)throw Object.assign(new Error("أحد أرقام IMEI غير متاح للمرتجع"),{status:409});}normalized.push({src,qty,line,imeis});}
      const prefix=`PR-${dayjs().format('YYYYMMDD')}`;const count=await tx.purchaseReturn.count({where:{returnNumber:{startsWith:prefix}}});const ret=await tx.purchaseReturn.create({data:{returnNumber:`${prefix}-${String(count+1).padStart(4,'0')}`,purchaseId:p.id,supplierId:p.supplierId,branchId:req.branchId,userId:req.user.id,total,refundAccountId:req.body.refundAccountId||null,notes:req.body.notes||null}});
      for(const x of normalized){const inv=await tx.inventory.findUnique({where:{productId_branchId:{productId:x.src.productId,branchId:req.branchId}}});if(!inv||inv.quantity<x.qty)throw Object.assign(new Error(`المخزون الحالي لا يكفي لإرجاع ${x.src.product.name}`),{status:422});await tx.inventory.update({where:{id:inv.id},data:{quantity:{decrement:x.qty}}});await tx.stockMovement.create({data:{branchId:req.branchId,productId:x.src.productId,userId:req.user.id,type:"PURCHASE_RETURN",quantity:-x.qty,quantityBefore:inv.quantity,quantityAfter:inv.quantity-x.qty,referenceType:"PurchaseReturn",referenceId:ret.id,notes:p.purchaseNumber}});if(x.imeis.length)await tx.productIMEI.deleteMany({where:{imei:{in:x.imeis},branchId:req.branchId,status:"IN_STOCK"}});await tx.purchaseReturnItem.create({data:{purchaseReturnId:ret.id,purchaseItemId:x.src.id,productId:x.src.productId,quantity:x.qty,unitCost:x.src.unitCost,lineTotal:x.line,imeiNumbers:x.imeis}});}
      await supplierLedger(tx,{supplierId:p.supplierId,branchId:req.branchId,type:"PURCHASE_RETURN",direction:"OUT",amount:total,referenceType:"PurchaseReturn",referenceId:ret.id,notes:req.body.notes});
      if(req.body.refundAccountId)await postMovement(tx,{branchId:req.branchId,accountId:req.body.refundAccountId,userId:req.user.id,type:"OTHER_IN",amount:total,direction:"IN",referenceType:"PurchaseReturn",referenceId:ret.id,description:`مرتجع مورد ${ret.returnNumber}`});
      return tx.purchaseReturn.findUnique({where:{id:ret.id},include:{supplier:true,items:{include:{product:true}}}});
    });
    await audit(req.user,"PURCHASE_RETURN","PurchaseReturn",result.id,{total:String(result.total)},req.branchId);io.to(`branch:${req.branchId}`).emit("inventory:refresh",{branchId:req.branchId});if(req.body.refundAccountId)io.to(`branch:${req.branchId}`).emit("finance:update",{branchId:req.branchId});res.status(201).json(result);
  }catch(err){res.status(err.status||500).json({error:err.status?err.message:"تعذر تنفيذ مرتجع المورد"});}
});

router.get("/returns/list", async (req,res)=>{
  const rows=await prisma.purchaseReturn.findMany({where:{branchId:req.branchId},include:{purchase:{select:{purchaseNumber:true}},supplier:{select:{name:true}},user:{select:{name:true}},refundAccount:{select:{name:true}},items:{include:{product:{select:{name:true,sku:true}}}}},orderBy:{createdAt:"desc"},take:150});res.json(rows);
});

router.get("/supplier/:supplierId/ledger", async (req,res)=>{
  const rows=await prisma.supplierLedger.findMany({where:{supplierId:req.params.supplierId,branchId:req.branchId},orderBy:{createdAt:"desc"},take:300}); res.json(rows);
});

export default router;
