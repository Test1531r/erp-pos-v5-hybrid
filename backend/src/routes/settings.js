import { Router } from "express";
import { prisma } from "../index.js";
import { authenticate, authorize, requireBranch } from "../middleware/auth.js";
import { audit } from "../utils/audit.js";
const router=Router();router.use(authenticate,requireBranch);
router.get("/",async(req,res)=>{const row=await prisma.branchSetting.upsert({where:{branchId:req.branchId},create:{branchId:req.branchId},update:{}});res.json(row)});
router.put("/",authorize("SUPER_ADMIN","BRANCH_MANAGER"),async(req,res)=>{try{const data={};for(const k of ['currency','invoiceFooter','returnDays','loyaltyEarnPerAmount','loyaltyPointsPerStep','loyaltyRedeemPointValue','requireShiftForPOS','requireApprovalExpenseAbove','requireApprovalDiscountAbove','vatRate'])if(req.body[k]!==undefined)data[k]=req.body[k]===''?null:req.body[k];const row=await prisma.branchSetting.upsert({where:{branchId:req.branchId},create:{branchId:req.branchId,...data},update:data});await audit(req.user,'SETTINGS_UPDATE','BranchSetting',row.id,data,req.branchId);res.json(row)}catch(err){res.status(400).json({error:'تعذر حفظ الإعدادات'})}});

router.get("/backup",authorize("SUPER_ADMIN"),async(req,res)=>{
  try{
    const [branches,users,categories,products,inventory,customers,suppliers,invoices,expenses,financialAccounts,financialTransactions,purchases,receivables,repairs,transfers,tradeIns,promotions,stocktakes]=await Promise.all([
      prisma.branch.findMany(),
      prisma.user.findMany({select:{id:true,name:true,username:true,email:true,role:true,isActive:true,branchId:true,permissions:true,maxDiscountPct:true,createdAt:true,updatedAt:true}}),
      prisma.category.findMany(), prisma.product.findMany(), prisma.inventory.findMany(), prisma.customer.findMany(), prisma.supplier.findMany(),
      prisma.invoice.findMany({include:{items:true,paymentSplits:true}}), prisma.expense.findMany(), prisma.financialAccount.findMany(), prisma.financialTransaction.findMany(),
      prisma.purchase.findMany({include:{items:true}}), prisma.customerReceivable.findMany({include:{installments:true,payments:true}}), prisma.repairTicket.findMany({include:{parts:true}}),
      prisma.stockTransfer.findMany({include:{items:true}}), prisma.tradeIn.findMany(), prisma.promotion.findMany({include:{products:true}}), prisma.stocktake.findMany({include:{items:true}})
    ]);
    const backup={version:"4.0.0",createdAt:new Date().toISOString(),branchScope:req.branchId,data:{branches,users,categories,products,inventory,customers,suppliers,invoices,expenses,financialAccounts,financialTransactions,purchases,receivables,repairs,transfers,tradeIns,promotions,stocktakes}};
    res.setHeader("Content-Disposition",`attachment; filename=erp-pos-backup-${new Date().toISOString().slice(0,10)}.json`);
    res.json(backup);
  }catch(err){res.status(500).json({error:"تعذر إنشاء النسخة الاحتياطية"});}
});
export default router;
