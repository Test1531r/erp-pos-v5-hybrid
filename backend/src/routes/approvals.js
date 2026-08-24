import { Router } from "express";
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
  const row=await prisma.approvalRequest.create({data:{branchId:req.branchId,requestedById:req.user.id,entityType:String(entityType),entityId:entityId||null,action:String(action),amount:req.body.amount||null,reason:reason||null,payload:payload||undefined}});
  await audit(req.user,"APPROVAL_REQUEST","ApprovalRequest",row.id,{action:row.action},req.branchId);
  res.status(201).json(row);
});

router.post("/:id/decision",authorize("SUPER_ADMIN","BRANCH_MANAGER"),async(req,res)=>{
  try{
    const decision=String(req.body.decision||"").toUpperCase();
    if(!["APPROVED","REJECTED"].includes(decision))return res.status(400).json({error:"قرار غير صالح"});
    const found=await prisma.approvalRequest.findFirst({where:{id:req.params.id,branchId:req.branchId,status:"PENDING"}});
    if(!found)return res.status(404).json({error:"الطلب غير موجود أو تم اتخاذ قرار فيه"});

    const result=await prisma.$transaction(async tx=>{
      let executedEntityId=found.entityId;
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
