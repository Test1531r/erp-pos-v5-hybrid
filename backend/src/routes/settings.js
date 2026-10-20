import { Router } from "express";
import { prisma } from "../index.js";
import { authenticate, authorize, requireBranch } from "../middleware/auth.js";
import { audit } from "../utils/audit.js";
import { Router } from "express";
import { prisma } from "../index.js";
import { authenticate, authorize, requireBranch } from "../middleware/auth.js";
import { audit } from "../utils/audit.js";

const router = Router();
router.use(authenticate, requireBranch);
const DEFAULT_FEATURES = {
  dashboard: true, pos: true, inventory: true, stockLedger: true, purchases: true,
  receivables: true, approvals: true, growth: true, closing: true, tools: true,
  stocktake: true, reports: true, sync: true, sales: true, customers: true,
  repairs: true, transfers: true, expenses: true, finance: true, returns: true,
  users: true, branches: true, loyalty: true, installments: true, offlineMode: true
};

router.get("/features", async (req, res) => {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { id: "global" }, select: { features: true, updatedAt: true } });
    res.json({ features: { ...DEFAULT_FEATURES, ...(row?.features || {}) }, updatedAt: row?.updatedAt || null });
  } catch { res.status(500).json({ error: "تعذر تحميل مميزات النظام" }); }
});

router.get("/system", authorize("SUPER_ADMIN"), async (req, res) => {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { id: "global" } });
    res.json({ features: { ...DEFAULT_FEATURES, ...(row?.features || {}) }, updatedAt: row?.updatedAt || null });
  } catch {
    res.status(500).json({ error: "تعذر تحميل إعدادات النظام" });
  }
});

router.put("/system", authorize("SUPER_ADMIN"), async (req, res) => {
  try {
    if (!req.body?.features || typeof req.body.features !== "object" || Array.isArray(req.body.features)) {
      return res.status(400).json({ error: "إعدادات المميزات غير صالحة" });
    }
    const features = { ...DEFAULT_FEATURES };
    for (const key of Object.keys(DEFAULT_FEATURES)) {
      if (req.body.features[key] !== undefined) {
        if (typeof req.body.features[key] !== "boolean") return res.status(400).json({ error: `قيمة الميزة ${key} يجب أن تكون true أو false` });
        features[key] = req.body.features[key];
      }
    }
    const row = await prisma.systemSetting.upsert({
      where: { id: "global" },
      create: { id: "global", features },
      update: { features }
    });
    await audit(req.user, "SYSTEM_FEATURES_UPDATE", "SystemSetting", row.id, features, req.branchId);
    res.json({ features: { ...DEFAULT_FEATURES, ...row.features }, updatedAt: row.updatedAt });
  } catch (err) {
    res.status(500).json({ error: "تعذر حفظ إعدادات النظام" });
  }
});


router.get("/",async(req,res)=>{const row=await prisma.branchSetting.upsert({where:{branchId:req.branchId},create:{branchId:req.branchId},update:{}});res.json(row)});
router.put("/",authorize("SUPER_ADMIN","BRANCH_MANAGER"),async(req,res)=>{try{
 const data={};
 const numberField=(key,{min=0,max=1000000000,integer=false,nullable=false}={})=>{
   if(req.body[key]===undefined)return;
   if(nullable&&(req.body[key]===null||req.body[key]==="")){data[key]=null;return;}
   const value=Number(req.body[key]);
   if(!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))throw Object.assign(new Error(`قيمة الإعداد ${key} غير صالحة`),{status:400});
   data[key]=value;
 };
 if(req.body.currency!==undefined){if(typeof req.body.currency!=="string"||req.body.currency.trim().length<1||req.body.currency.trim().length>8)return res.status(400).json({error:"رمز العملة يجب أن يكون من 1 إلى 8 أحرف"});data.currency=req.body.currency.trim().toUpperCase();}
 if(req.body.invoiceFooter!==undefined){if(req.body.invoiceFooter!==null&&typeof req.body.invoiceFooter!=="string")return res.status(400).json({error:"تذييل الفاتورة غير صالح"});data.invoiceFooter=req.body.invoiceFooter===null?null:String(req.body.invoiceFooter).slice(0,1000);}
 if(req.body.requireShiftForPOS!==undefined){if(typeof req.body.requireShiftForPOS!=="boolean")return res.status(400).json({error:"قيمة إعداد الوردية غير صالحة"});data.requireShiftForPOS=req.body.requireShiftForPOS;}
 numberField("returnDays",{min:0,max:365,integer:true});
 numberField("vatRate",{min:0,max:100});
 numberField("loyaltyEarnPerAmount",{min:0.01,max:1000000000});
 numberField("loyaltyPointsPerStep",{min:0,max:100000,integer:true});
 numberField("loyaltyRedeemPointValue",{min:0,max:1000000});
 numberField("requireApprovalExpenseAbove",{min:0,max:1000000000,nullable:true});
 numberField("requireApprovalDiscountAbove",{min:0,max:100,nullable:true});
 const row=await prisma.branchSetting.upsert({where:{branchId:req.branchId},create:{branchId:req.branchId,...data},update:data});
 await audit(req.user,"SETTINGS_UPDATE","BranchSetting",row.id,data,req.branchId);
 res.json(row);
}catch(err){res.status(err.status||400).json({error:err.status?err.message:"تعذر حفظ الإعدادات"});}});

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
