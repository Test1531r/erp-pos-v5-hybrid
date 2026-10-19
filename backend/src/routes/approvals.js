import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../index.js";
import { authenticate, authorize, requireBranch } from "../middleware/auth.js";
import { audit } from "../utils/audit.js";
import { ensureDefaultAccounts, postMovement } from "../utils/finance.js";

const router=Router();
router.use(authenticate,requireBranch);

router.get("/",async(req,res)=>{
  const where={branchId:req.branchId};
  if(req.query.status)where.status=req.query.status;
  const rows=await prisma.approvalRequest.findMany({where,include:{requestedBy:{select:{name:true,role:true}},decidedBy:{select:{name:true}}},orderBy:{createdAt:"desc"},take:200});
  res.json(rows);
});

router.post("/",async(req,res)=>{
  const {entityType,entityId,action,reason,payload}=req.body;
  if(!entityType||!action)return res.status(400).json({error:"نوع الطلب والإجراء مطلوبان"});
  const safeType=String(entityType).trim().toUpperCase().slice(0,60);
  const safeAction=String(action).trim().toUpperCase().slice(0,80);
  let safePayload=payload;
  let amount=null;
  if(safeType==="DISCOUNT"&&safeAction==="APPROVE_DISCOUNT"){
    const discountAmount=Number(payload?.discountAmount);
    const subtotal=Number(payload?.subtotal);
    if(!Number.isFinite(discountAmount)||discountAmount<=0||!Number.isFinite(subtotal)||subtotal<=0||discountAmount>subtotal)
      return res.status(400).json({error:"قيمة الخصم أو إجمالي الفاتورة غير صالح"});
    if(!["CASHIER","BRANCH_MANAGER","SUPER_ADMIN"].includes(req.user.role))
      return res.status(403).json({error:"هذا الدور لا يمكنه طلب اعتماد خصم"});
    amount=new Prisma.Decimal(discountAmount.toFixed(2));
    safePayload={discountAmount:Number(discountAmount.toFixed(2)),subtotal:Number(subtotal.toFixed(2)),itemCount:Math.max(0,Math.min(100,Number.parseInt(payload?.itemCount,10)||0)),cartSignature:typeof payload?.cartSignature==="string"?payload.cartSignature.slice(0,4000):""};
  }else{
    amount=req.body.amount==null?null:new Prisma.Decimal(Number(req.body.amount));
    if(amount&&!amount.isFinite())return res.status(400).json({error:"المبلغ غير صالح"});
  }
  const row=await prisma.approvalRequest.create({data:{branchId:req.branchId,requestedById:req.user.id,entityType:safeType,entityId:entityId||null,action:safeAction,amount,reason:reason?String(reason).slice(0,500):null,payload:safePayload||undefined}});
  await audit(req.user,"APPROVAL_REQUEST","ApprovalRequest",row.id,{action:row.action,entityType:row.entityType},req.branchId);
  res.status(201).json(row);
});

router.post("/:id/decision",authorize("SUPER_ADMIN","BRANCH_MANAGER"),async(req,res)=>{
  try{
    const decision=String(req.body.decision||"").toUpperCase();
    if(!["APPROVED","REJECTED"].includes(decision))return res.status(400).json({error:"قرار غير صالح"});
    const found=await prisma.approvalRequest.findFirst({where:{id:req.params.id,branchId:req.branchId,status:"PENDING"}});
    if(!found)return res.status(404).json({error:"الطلب غير موجود أو تم اتخاذ قرار فيه"});
    if(found.requestedById===req.user.id)return res.status(403).json({error:"لا يمكن اعتماد طلب أنشأته بنفسك"});

    const result=await prisma.$transaction(async tx=>{
      let executedEntityId=found.entityId;
      if(decision==="APPROVED" && found.entityType==="DISCOUNT" && found.action==="APPROVE_DISCOUNT"){
        if(!found.payload||!Number.isFinite(Number(found.payload.discountAmount))||Number(found.payload.discountAmount)<=0)
          throw Object.assign(new Error("بيانات طلب الخصم غير مكتملة"),{status:422});
      }
      if(decision==="APPROVED" && found.entityType==="EXPENSE" && found.action==="CREATE_EXPENSE"){
        const payload=found.payload||{};
        await ensureDefaultAccounts(tx,req.branchId);
        let accountId=payload.accountId;
        if(!accountId)accountId=(await tx.financialAccount.findFirst({where:{branchId:req.branchId,type:"CASHBOX",isActive:true}}))?.id;
        if(!accountId)throw Object.assign(new Error("لا يوجد حساب مالي لتنفيذ المصروف"),{status:422});
        const created=await tx.expense.create({data:{branchId:req.branchId,userId:found.requestedById,category:payload.category||"OTHER",description:String(payload.description||found.reason||"مصروف معتمد").slice(0,500),amount:payload.amount,paidAt:payload.paidAt?new Date(payload.paidAt):new Date()}});
        const movement=await postMovement(tx,{branchId:req.branchId,accountId,userId:found.requestedById,type:"EXPENSE",amount:payload.amount,direction:"OUT",referenceType:"Expense",referenceId:created.id,description:created.description});
        await tx.expense.update({where:{id:created.id},data:{financialTransactionId:movement.movement.id}});
        if(movement.account.type==="CASHBOX")await tx.branch.update({where:{id:req.branchId},data:{cashboxBalance:{decrement:payload.amount}}});
        executedEntityId=created.id;
      }
      return tx.approvalRequest.update({where:{id:found.id},data:{status:decision,entityId:executedEntityId,decidedById:req.user.id,decisionNotes:req.body.notes||null,decidedAt:new Date()}});
    });
    await audit(req.user,"APPROVAL_DECISION","ApprovalRequest",result.id,{decision,executedEntityId:result.entityId},req.branchId);
    res.json(result);
  }catch(err){res.status(err.status||500).json({error:err.status?err.message:"تعذر تنفيذ قرار الموافقة"});}
});

export default router;
