import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma, io } from "../index.js";
import { authenticate, authorize, requireBranch } from "../middleware/auth.js";
import { money } from "../utils/security.js";
import { postMovement } from "../utils/finance.js";
import { audit } from "../utils/audit.js";
const router=Router(); router.use(authenticate,authorize("SUPER_ADMIN","BRANCH_MANAGER","CASHIER","ACCOUNTANT"),requireBranch); const D=v=>new Prisma.Decimal(v);
function validDate(value){if(value==null||value==="")return null;const d=new Date(value);return Number.isNaN(d.getTime())?null:d;}
function addMonthsSafely(date,months){const d=new Date(date);const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+months);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));return d;}

router.get("/",async(req,res)=>{const rows=await prisma.customerReceivable.findMany({where:{branchId:req.branchId},include:{customer:{select:{id:true,name:true,phone:true,creditLimit:true,creditBalance:true}},invoice:{select:{invoiceNumber:true}},installments:true,payments:{orderBy:{createdAt:"desc"}}},orderBy:{createdAt:"desc"},take:250});res.json(rows);});

router.post("/",async(req,res)=>{try{
const customerId=String(req.body.customerId||"");
const amount=D(money(req.body.amount,"المبلغ",{allowZero:false}));
const rawCount=Number(req.body.installmentsCount||0);
if(!Number.isInteger(rawCount)||rawCount<0||rawCount>60)return res.status(400).json({error:"عدد الأقساط يجب أن يكون بين 0 و60"});
const count=rawCount;
const firstDue=validDate(req.body.firstDueDate);
const dueDate=validDate(req.body.dueDate);
if(req.body.firstDueDate&&!firstDue)return res.status(400).json({error:"تاريخ أول قسط غير صالح"});
if(req.body.dueDate&&!dueDate)return res.status(400).json({error:"تاريخ الاستحقاق غير صالح"});
if(count>0&&!firstDue)return res.status(400).json({error:"حدد تاريخ أول قسط لإنشاء جدول الأقساط"});
const customer=await prisma.customer.findUnique({where:{id:customerId}});
if(!customer)return res.status(404).json({error:"العميل غير موجود"});
if(D(customer.creditLimit).greaterThan(0)&&D(customer.creditBalance).add(amount).greaterThan(customer.creditLimit))return res.status(422).json({error:"تجاوز الحد الائتماني للعميل"});
const r=await prisma.$transaction(async tx=>{
 const rec=await tx.customerReceivable.create({data:{customerId,branchId:req.branchId,invoiceId:req.body.invoiceId||null,originalAmount:amount,remaining:amount,dueDate,notes:req.body.notes?String(req.body.notes).slice(0,1000):null}});
 await tx.customer.update({where:{id:customerId},data:{creditBalance:{increment:amount}}});
 if(count>0){const each=amount.div(count);let allocated=D(0);for(let i=1;i<=count;i++){const due=addMonthsSafely(firstDue,i-1);const val=i===count?amount.sub(allocated):each.toDecimalPlaces(2);allocated=allocated.add(val);await tx.installment.create({data:{receivableId:rec.id,sequence:i,dueDate:due,amount:val}});}}
 return tx.customerReceivable.findUnique({where:{id:rec.id},include:{customer:{select:{id:true,name:true}},installments:true}});
});
await audit(req.user,"RECEIVABLE_CREATE","CustomerReceivable",r.id,{amount:String(amount),installments:count},req.branchId);
res.status(201).json(r);
}catch(err){res.status(err.status||500).json({error:err.status?err.message:"تعذر إنشاء المديونية"});}});

router.post("/:id/pay",async(req,res)=>{try{const amount=D(money(req.body.amount,"المبلغ",{allowZero:false}));const accountId=String(req.body.accountId||"");if(!accountId)return res.status(400).json({error:"اختر حساب التحصيل"});const result=await prisma.$transaction(async tx=>{const r=await tx.customerReceivable.findFirst({where:{id:req.params.id,branchId:req.branchId},include:{installments:{orderBy:{sequence:"asc"}}}});if(!r)throw Object.assign(new Error("المديونية غير موجودة"),{status:404});if(amount.greaterThan(r.remaining))throw Object.assign(new Error("الدفعة أكبر من المتبقي"),{status:400});const movement=await postMovement(tx,{branchId:req.branchId,accountId,userId:req.user.id,type:"OTHER_IN",amount,direction:"IN",referenceType:"CustomerReceivable",referenceId:r.id,description:"تحصيل مديونية عميل"});await tx.customerPayment.create({data:{receivableId:r.id,customerId:r.customerId,branchId:req.branchId,userId:req.user.id,accountId,amount,reference:req.body.reference||null,notes:req.body.notes||null}});await tx.customer.update({where:{id:r.customerId},data:{creditBalance:{decrement:amount}}});let left=amount;for(const inst of r.installments){if(left.lte(0))break;const remain=D(inst.amount).sub(inst.paidAmount);if(remain.lte(0))continue;const apply=left.greaterThan(remain)?remain:left;const newPaid=D(inst.paidAmount).add(apply);await tx.installment.update({where:{id:inst.id},data:{paidAmount:newPaid,status:newPaid.greaterThanOrEqualTo(inst.amount)?"PAID":inst.dueDate<new Date()?"OVERDUE":"PENDING",paidAt:newPaid.greaterThanOrEqualTo(inst.amount)?new Date():null}});left=left.sub(apply);}if(movement.account.type==="CASHBOX")await tx.branch.update({where:{id:req.branchId},data:{cashboxBalance:{increment:amount}}});const newPaid=D(r.paidAmount).add(amount),remaining=D(r.remaining).sub(amount);return tx.customerReceivable.update({where:{id:r.id},data:{paidAmount:newPaid,remaining,status:remaining.lte(0)?"PAID":"PARTIAL"},include:{customer:true,installments:true}});});io.to(`branch:${req.branchId}`).emit("finance:update",{branchId:req.branchId});await audit(req.user,"CUSTOMER_PAYMENT","CustomerReceivable",result.id,{amount:String(amount)},req.branchId);res.json(result);}catch(err){res.status(err.status||500).json({error:err.status?err.message:"تعذر تسجيل التحصيل"});}});

router.post("/refresh-overdue",authorize("SUPER_ADMIN","BRANCH_MANAGER","ACCOUNTANT"),async(req,res)=>{const now=new Date();const installments=await prisma.installment.updateMany({where:{dueDate:{lt:now},status:"PENDING",receivable:{branchId:req.branchId}},data:{status:"OVERDUE"}});const receivables=await prisma.customerReceivable.updateMany({where:{branchId:req.branchId,dueDate:{lt:now},status:{in:["OPEN","PARTIAL"]}},data:{status:"OVERDUE"}});res.json({installments:installments.count,receivables:receivables.count});});
export default router;
