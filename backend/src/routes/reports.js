import { Router } from "express";
import { prisma } from "../index.js";
import { authenticate, requireBranch } from "../middleware/auth.js";
import dayjs from "dayjs";

const router = Router();
router.use(authenticate);

router.get("/dashboard", async (req, res) => {
  try {
    const branchId = req.branchId;
    const bf = branchId ? { branchId } : {};
    const todayStart = dayjs().startOf("day").toDate();
    const todayEnd = dayjs().endOf("day").toDate();
    const monthStart = dayjs().startOf("month").toDate();
    const monthEnd = dayjs().endOf("month").toDate();
    const invoiceWhereMonth = { ...bf, createdAt: { gte: monthStart, lte: monthEnd } };

    const [todayAgg, monthAgg, allTimeAgg, pendingRepairs, customersWithSales, expensesMonth, recentSales, repairsByStatus, returnsMonth, receivables, supplierPurchases, accounts] = await prisma.$transaction([
      prisma.invoice.aggregate({ where: { ...bf, createdAt: { gte: todayStart, lte: todayEnd } }, _sum: { total: true }, _count: { id: true } }),
      prisma.invoice.aggregate({ where: invoiceWhereMonth, _sum: { total: true, discountAmount: true, taxAmount: true }, _count: { id: true } }),
      prisma.invoice.aggregate({ where: bf, _sum: { total: true } }),
      prisma.repairTicket.count({ where: { ...bf, status: { in: ["RECEIVED", "DIAGNOSING", "UNDER_REPAIR", "WAITING_PARTS"] } } }),
      prisma.invoice.findMany({ where: { ...bf, customerId: { not: null } }, distinct: ["customerId"], select: { customerId: true } }),
      prisma.expense.aggregate({ where: { ...bf, paidAt: { gte: monthStart, lte: monthEnd } }, _sum: { amount: true } }),
      prisma.invoice.findMany({ where: bf, include: { customer: { select: { name: true } }, _count: { select: { items: true } } }, orderBy: { createdAt: "desc" }, take: 8 }),
      prisma.repairTicket.groupBy({ by: ["status"], where: bf, _count: { id: true } }),
      prisma.saleReturn.aggregate({ where: { ...bf, status: "COMPLETED", createdAt: { gte: monthStart, lte: monthEnd } }, _sum: { total: true } }),
      prisma.customerReceivable.aggregate({ where: { ...bf, status: { in: ["OPEN","PARTIAL","OVERDUE"] } }, _sum: { remaining: true }, _count: { id: true } }),
      prisma.purchase.findMany({ where: { ...(branchId ? { branchId } : {}), status: { not: "CANCELLED" } }, select: { total: true, paidAmount: true } }),
      branchId ? prisma.financialAccount.findMany({ where: { branchId, isActive: true }, select: { id: true, name: true, type: true, balance: true } }) : prisma.financialAccount.findMany({ where: { isActive: true }, select: { id: true, name: true, type: true, balance: true, branchId: true } }),
    ]);

    const cogsRows = await prisma.invoiceItem.findMany({ where: { invoice: invoiceWhereMonth }, select: { quantity: true, costPrice: true } });
    const cogs = cogsRows.reduce((sum, x) => sum + Number(x.costPrice) * x.quantity, 0);
    const revenue = Number(monthAgg._sum.total || 0);
    const returns = Number(returnsMonth._sum.total || 0);
    const expenses = Number(expensesMonth._sum.amount || 0);
    const netSales = revenue - returns;
    const grossProfit = netSales - cogs;
    const netProfit = grossProfit - expenses;

    const allInv = await prisma.inventory.findMany({ where: bf, include: { product: { select: { name: true, sku: true, lowStockQty: true, costPrice: true } }, branch: { select: { name: true } } } });
    const lowStockItems = allInv.filter((inv) => inv.quantity <= inv.product.lowStockQty);
    const inventoryValue = allInv.reduce((sum, inv) => sum + inv.quantity * Number(inv.product.costPrice || 0), 0);

    const topProducts = await prisma.invoiceItem.groupBy({
      by: ["productId", "productName"],
      where: branchId ? { invoice: { branchId } } : {},
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { lineTotal: "desc" } },
      take: 5,
    });

    const salesTrend = [];
    for (let i = 6; i >= 0; i--) {
      const date = dayjs().subtract(i, "day");
      const start = date.startOf("day").toDate(), end = date.endOf("day").toDate();
      const [agg, ret] = await prisma.$transaction([
        prisma.invoice.aggregate({ where: { ...bf, createdAt: { gte: start, lte: end } }, _sum: { total: true }, _count: { id: true } }),
        prisma.saleReturn.aggregate({ where: { ...bf, status: "COMPLETED", createdAt: { gte: start, lte: end } }, _sum: { total: true } }),
      ]);
      salesTrend.push({ date: date.format("DD/MM"), revenue: Number(agg._sum.total || 0), returns: Number(ret._sum.total || 0), count: agg._count.id || 0 });
    }

    res.json({
      today: { revenue: Number(todayAgg._sum.total || 0), count: todayAgg._count.id || 0, averageTicket: todayAgg._count.id ? Number(todayAgg._sum.total || 0) / todayAgg._count.id : 0 },
      month: { revenue, netSales, returns, cogs, grossProfit, expenses, netProfit, count: monthAgg._count.id || 0, discount: Number(monthAgg._sum.discountAmount || 0), tax: Number(monthAgg._sum.taxAmount || 0) },
      allTime: { revenue: Number(allTimeAgg._sum.total || 0) },
      pendingRepairs, totalCustomers: customersWithSales.length,
      receivables: { amount: Number(receivables._sum.remaining || 0), count: receivables._count.id || 0 },
      supplierDue: supplierPurchases.reduce((sum, purchase) => sum + Math.max(0, Number(purchase.total || 0) - Number(purchase.paidAmount || 0)), 0),
      inventoryValue,
      accounts: accounts.map(a => ({ ...a, balance: Number(a.balance) })),
      lowStockCount: lowStockItems.length, lowStockItems: lowStockItems.slice(0, 8),
      recentSales, repairsByStatus, topProducts, salesTrend,
    });
  } catch (err) {
    console.error("[Dashboard report]", err);
    res.status(500).json({ error: "تعذر تحميل لوحة التحكم" });
  }
});

router.get("/profit-loss", requireBranch, async (req,res)=>{
  try{
    const parseDate = (value, label, endOfDay = false) => {
      if (value === undefined || value === "") return null;
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const error = new Error(`تاريخ ${label} غير صالح؛ استخدم YYYY-MM-DD`);
        error.status = 400;
        throw error;
      }
      const parsed = dayjs(value);
      if (!parsed.isValid() || parsed.format("YYYY-MM-DD") !== value) {
        const error = new Error(`تاريخ ${label} غير صالح`);
        error.status = 400;
        throw error;
      }
      return (endOfDay ? parsed.endOf("day") : parsed.startOf("day")).toDate();
    };
    const from = parseDate(req.query.from, "البداية") || dayjs().startOf("month").toDate();
    const to = parseDate(req.query.to, "النهاية", true) || new Date();
    if (from > to) return res.status(400).json({ error: "تاريخ البداية يجب أن يسبق تاريخ النهاية" });
    const base={branchId:req.branchId,createdAt:{gte:from,lte:to}};
    const [sales,returns,expenses,items,purchases]=await prisma.$transaction([
      prisma.invoice.aggregate({where:base,_sum:{total:true,taxAmount:true,discountAmount:true},_count:{id:true}}),
      prisma.saleReturn.aggregate({where:{...base,status:"COMPLETED"},_sum:{total:true}}),
      prisma.expense.aggregate({where:{branchId:req.branchId,paidAt:{gte:from,lte:to}},_sum:{amount:true}}),
      prisma.invoiceItem.findMany({where:{invoice:base},select:{quantity:true,costPrice:true,lineTotal:true}}),
      prisma.purchase.aggregate({where:{branchId:req.branchId,createdAt:{gte:from,lte:to},status:{not:"CANCELLED"}},_sum:{total:true,paidAmount:true}}),
    ]);
    const revenue=Number(sales._sum.total||0),ret=Number(returns._sum.total||0),exp=Number(expenses._sum.amount||0),cogs=items.reduce((n,i)=>n+i.quantity*Number(i.costPrice),0),netSales=revenue-ret,grossProfit=netSales-cogs;
    res.json({from,to,revenue,returns:ret,netSales,cogs,grossProfit,expenses:exp,netProfit:grossProfit-exp,tax:Number(sales._sum.taxAmount||0),discount:Number(sales._sum.discountAmount||0),invoiceCount:sales._count.id||0,purchases:Number(purchases._sum.total||0),purchasePaid:Number(purchases._sum.paidAmount||0)});
  }catch(err){
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error("[Profit-loss report]", err);
    res.status(500).json({error:"تعذر إنشاء تقرير الأرباح والخسائر"});
  }
});

export default router;
