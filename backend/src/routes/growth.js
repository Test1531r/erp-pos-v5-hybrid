import { Router } from "express";
import { prisma } from "../index.js";
import { authenticate, authorize, requireBranch } from "../middleware/auth.js";
import { money } from "../utils/security.js";
import { audit } from "../utils/audit.js";
const router=Router();router.use(authenticate,requireBranch);
router.get("/promotions",async(req,res)=>res.json(await prisma.promotion.findMany({include:{products:{include:{product:{select:{id:true,name:true,sku:true}}}}},orderBy:{createdAt:"desc"}})));
router.post("/promotions",authorize("SUPER_ADMIN","BRANCH_MANAGER"),async(req,res)=>{try{
  const name=String(req.body.name||"").trim();
  const type=req.body.type==="FIXED"?"FIXED":"PERCENT";
  const value=money(req.body.value,"قيمة العرض");
  const minTotal=money(req.body.minTotal||0,"الحد الأدنى");
  const maxTotal=req.body.maxTotal===""||req.body.maxTotal==null?null:money(req.body.maxTotal,"الحد الأقصى");
  const maxDiscount=req.body.maxDiscount===""||req.body.maxDiscount==null?null:money(req.body.maxDiscount,"أقصى خصم");
  const minQuantity=Math.max(1,Math.floor(Number(req.body.minQuantity||1)));
  const usageLimit=req.body.usageLimit===""||req.body.usageLimit==null?null:Number(req.body.usageLimit);
  const startsAt=new Date(req.body.startsAt), endsAt=new Date(req.body.endsAt);
  if(!name||!Number.isFinite(value)||value<=0||(type==="PERCENT"&&value>100)||!Number.isFinite(minTotal)||minTotal<0||(maxTotal!==null&&(!Number.isFinite(maxTotal)||maxTotal<minTotal))||(maxDiscount!==null&&(!Number.isFinite(maxDiscount)||maxDiscount<=0))||!Number.isInteger(minQuantity)||minQuantity<1||(usageLimit!==null&&(!Number.isInteger(usageLimit)||usageLimit<1))||!Number.isFinite(startsAt.getTime())||!Number.isFinite(endsAt.getTime())||endsAt<=startsAt)return res.status(400).json({error:"راجع قيمة العرض والحدود والكمية وتواريخ البداية والنهاية"});
  const productIds=[...new Set(Array.isArray(req.body.productIds)?req.body.productIds.map(String):[])];
  const row=await prisma.promotion.create({data:{name,code:req.body.code?String(req.body.code).trim().toUpperCase()||null:null,type,value,minTotal,maxTotal,maxDiscount,minQuantity,startsAt,endsAt,usageLimit,products:{create:productIds.map(productId=>({productId}))}}});
  await audit(req.user,"PROMOTION_CREATE","Promotion",row.id,{name:row.name,code:row.code,minTotal,maxTotal,maxDiscount,minQuantity,usageLimit},req.branchId);
  res.status(201).json(row);
}catch(e){res.status(400).json({error:e.code==="P2002"?"كود العرض مستخدم بالفعل":"بيانات العرض غير صالحة أو كود العرض مستخدم"});}});
router.patch("/promotions/:id",authorize("SUPER_ADMIN","BRANCH_MANAGER"),async(req,res)=>{try{const row=await prisma.promotion.update({where:{id:req.params.id},data:{isActive:Boolean(req.body.isActive)}});await audit(req.user,"PROMOTION_STATUS","Promotion",row.id,{isActive:row.isActive},req.branchId);res.json(row);}catch{res.status(404).json({error:"العرض غير موجود"});}});
router.put("/promotions/:id",authorize("SUPER_ADMIN","BRANCH_MANAGER"),async(req,res)=>{try{
  const current=await prisma.promotion.findUnique({where:{id:req.params.id}});
  if(!current)return res.status(404).json({error:"العرض غير موجود"});
  const name=String(req.body.name??current.name).trim(), type=req.body.type??current.type, value=money(req.body.value??current.value,"قيمة العرض");
  const minTotal=money(req.body.minTotal??current.minTotal,"الحد الأدنى");
  const maxTotal=req.body.maxTotal===undefined?current.maxTotal:(req.body.maxTotal===""||req.body.maxTotal===null?null:money(req.body.maxTotal,"الحد الأقصى"));
  const maxDiscount=req.body.maxDiscount===undefined?current.maxDiscount:(req.body.maxDiscount===""||req.body.maxDiscount===null?null:money(req.body.maxDiscount,"أقصى خصم"));
  const minQuantity=Math.max(1,Math.floor(Number(req.body.minQuantity??current.minQuantity)));
  const usageLimit=req.body.usageLimit===undefined?current.usageLimit:(req.body.usageLimit===""||req.body.usageLimit===null?null:Number(req.body.usageLimit));
  const startsAt=new Date(req.body.startsAt??current.startsAt), endsAt=new Date(req.body.endsAt??current.endsAt);
  if(!name||!Number.isFinite(value)||value<=0||(type==="PERCENT"&&value>100)||minTotal<0||(maxTotal!==null&&(!Number.isFinite(maxTotal)||maxTotal<minTotal))||(maxDiscount!==null&&(!Number.isFinite(maxDiscount)||maxDiscount<=0))||!Number.isInteger(minQuantity)||minQuantity<1||(usageLimit!==null&&(!Number.isInteger(usageLimit)||usageLimit<1))||!Number.isFinite(startsAt.getTime())||!Number.isFinite(endsAt.getTime())||endsAt<=startsAt)return res.status(400).json({error:"راجع إعدادات العرض"});
  const productIds=Array.isArray(req.body.productIds)?[...new Set(req.body.productIds.map(String))]:null;
  const row=await prisma.$transaction(async tx=>{
    if(productIds)await tx.promotionProduct.deleteMany({where:{promotionId:current.id}});
    return tx.promotion.update({where:{id:current.id},data:{name,code:req.body.code===undefined?current.code:(String(req.body.code||"").trim().toUpperCase()||null),type,value,minTotal,maxTotal,maxDiscount,minQuantity,startsAt,endsAt,usageLimit,...(productIds?{products:{create:productIds.map(productId=>({productId}))}}:{})},include:{products:{include:{product:{select:{id:true,name:true,sku:true}}}}}});
  });
  await audit(req.user,"PROMOTION_UPDATE","Promotion",row.id,{name:row.name,code:row.code},req.branchId);res.json(row);
}catch(e){res.status(400).json({error:e.code==="P2002"?"كود العرض مستخدم بالفعل":"تعذر تعديل العرض؛ راجع البيانات"});}});
router.get("/loyalty/:customerId",async(req,res)=>{const customer=await prisma.customer.findUnique({where:{id:req.params.customerId},select:{id:true,name:true,loyaltyPoints:true}});if(!customer)return res.status(404).json({error:"العميل غير موجود"});const transactions=await prisma.loyaltyTransaction.findMany({where:{customerId:customer.id},orderBy:{createdAt:"desc"},take:100});res.json({customer,transactions});});
router.post("/loyalty/:customerId/adjust",authorize("SUPER_ADMIN","BRANCH_MANAGER"),async(req,res)=>{const points=Number(req.body.points||0);if(!Number.isInteger(points)||points===0)return res.status(400).json({error:"عدد النقاط غير صالح"});const result=await prisma.$transaction(async tx=>{const c=await tx.customer.findUnique({where:{id:req.params.customerId}});if(!c)throw new Error("NOT_FOUND");if(c.loyaltyPoints+points<0)throw new Error("NEGATIVE");await tx.customer.update({where:{id:c.id},data:{loyaltyPoints:{increment:points}}});return tx.loyaltyTransaction.create({data:{customerId:c.id,userId:req.user.id,points,type:"ADJUSTMENT",notes:req.body.notes||null}});}).catch(e=>e);if(result?.message==="NOT_FOUND")return res.status(404).json({error:"العميل غير موجود"});if(result?.message==="NEGATIVE")return res.status(400).json({error:"الرصيد لا يكفي"});res.status(201).json(result);});
router.get("/trade-ins",async(req,res)=>{const rows=await prisma.tradeIn.findMany({where:{branchId:req.branchId},include:{customer:{select:{name:true,phone:true}},user:{select:{name:true}},product:{select:{name:true,sku:true}}},orderBy:{createdAt:"desc"},take:200});res.json(rows);});
router.post("/trade-ins",async(req,res)=>{const row=await prisma.tradeIn.create({data:{branchId:req.branchId,userId:req.user.id,customerId:req.body.customerId||null,productId:req.body.productId||null,deviceBrand:req.body.deviceBrand||null,deviceModel:req.body.deviceModel||null,imei:req.body.imei||null,condition:req.body.condition||null,quotedValue:money(req.body.quotedValue||0,"التقييم"),finalValue:money(req.body.finalValue||0,"القيمة النهائية"),notes:req.body.notes||null}});await audit(req.user,"TRADE_IN_CREATE","TradeIn",row.id,{imei:row.imei},req.branchId);res.status(201).json(row);});
router.patch("/trade-ins/:id",authorize("SUPER_ADMIN","BRANCH_MANAGER","INVENTORY_MANAGER"),async(req,res)=>{const data={};if(req.body.status)data.status=req.body.status;if(req.body.finalValue!==undefined)data.finalValue=money(req.body.finalValue,"القيمة النهائية");if(req.body.notes!==undefined)data.notes=req.body.notes;const row=await prisma.tradeIn.update({where:{id:req.params.id},data});res.json(row);});
router.post("/trade-ins/:id/receive-stock",authorize("SUPER_ADMIN","BRANCH_MANAGER","INVENTORY_MANAGER"),async(req,res)=>{
  try{
    const trade=await prisma.tradeIn.findFirst({where:{id:req.params.id,branchId:req.branchId}});
    if(!trade)return res.status(404).json({error:"Trade-In غير موجود"});
    if(trade.status==="APPROVED"&&trade.productId)return res.status(409).json({error:"تم إدخال الجهاز للمخزون بالفعل"});
    const productId=String(req.body.productId||"").trim();
    if(!productId)return res.status(400).json({error:"اختر المنتج الذي سيُضاف إليه الجهاز المستعمل"});
    const product=await prisma.product.findUnique({where:{id:productId}});
    if(!product||!product.isActive)return res.status(404).json({error:"المنتج غير موجود"});
    const result=await prisma.$transaction(async tx=>{
      const inv=await tx.inventory.upsert({where:{productId_branchId:{productId,branchId:req.branchId}},create:{productId,branchId:req.branchId,quantity:1},update:{quantity:{increment:1}}});
      if(product.hasIMEI){
        if(!trade.imei)throw new Error("IMEI_REQUIRED");
        const dup=await tx.productIMEI.findUnique({where:{imei:trade.imei}});
        if(dup)throw new Error("IMEI_DUP");
        await tx.productIMEI.create({data:{productId,branchId:req.branchId,imei:trade.imei,status:"IN_STOCK",notes:`Trade-In ${trade.id}`}});
      }
      await tx.stockMovement.create({data:{branchId:req.branchId,productId,type:"TRADE_IN",quantity:1,balanceAfter:inv.quantity,referenceType:"TradeIn",referenceId:trade.id,userId:req.user.id,notes:trade.condition||null}});
      return tx.tradeIn.update({where:{id:trade.id},data:{productId,status:"APPROVED",finalValue:trade.finalValue||trade.quotedValue}});
    });
    await audit(req.user,"TRADE_IN_STOCK","TradeIn",trade.id,{productId,imei:trade.imei},req.branchId);
    res.json(result);
  }catch(err){
    if(err.message==="IMEI_REQUIRED")return res.status(400).json({error:"المنتج يتطلب IMEI والجهاز المسجل بدون IMEI"});
    if(err.message==="IMEI_DUP")return res.status(409).json({error:"IMEI موجود بالفعل في النظام"});
    res.status(500).json({error:"تعذر إدخال Trade-In للمخزون"});
  }
});
router.get("/notifications",async(req,res)=>{const rows=await prisma.notification.findMany({where:{OR:[{userId:req.user.id},{userId:null,branchId:req.branchId}]},orderBy:{createdAt:"desc"},take:100});res.json(rows);});
router.post("/notifications/:id/read",async(req,res)=>{await prisma.notification.updateMany({where:{id:req.params.id,OR:[{userId:req.user.id},{userId:null,branchId:req.branchId}]},data:{isRead:true}});res.json({ok:true});});
export default router;
