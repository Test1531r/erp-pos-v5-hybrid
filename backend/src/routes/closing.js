import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../index.js";
import { authenticate, authorize, requireBranch } from "../middleware/auth.js";
import { money } from "../utils/security.js";
import { audit } from "../utils/audit.js";

const router = Router();
router.use(authenticate, authorize("SUPER_ADMIN", "BRANCH_MANAGER", "ACCOUNTANT"), requireBranch);
const D = (value) => new Prisma.Decimal(value);

router.get("/", async (req, res) => {
  try {
    const rows = await prisma.dailyClosing.findMany({
      where: { branchId: req.branchId },
      include: { user: { select: { name: true } } },
      orderBy: { businessDate: "desc" },
      take: 100,
    });
    res.json(rows);
  } catch (error) {
    console.error("[Daily closing list]", { branchId: req.branchId, message: error.message });
    res.status(500).json({ error: "تعذر تحميل سجل الإقفال اليومي" });
  }
});

router.post("/", async (req, res) => {
  try {
    const rawDate = req.body.businessDate || new Date().toISOString().slice(0, 10);
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) return res.status(400).json({ error: "تاريخ الإقفال غير صالح" });
    date.setUTCHours(0, 0, 0, 0);
    const nextDate = new Date(date);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const actual = D(money(req.body.cashActual, "الرصيد الفعلي"));
    const notes = req.body.notes ? String(req.body.notes).slice(0, 1000) : null;

    const existing = await prisma.dailyClosing.findFirst({
      where: { branchId: req.branchId, businessDate: date },
      select: { id: true },
    });
    if (existing) return res.status(409).json({ error: "تم إقفال هذا اليوم بالفعل" });

    const [sales, returns, expenses, cashAccounts] = await prisma.$transaction([
      prisma.invoice.aggregate({
        where: { branchId: req.branchId, createdAt: { gte: date, lt: nextDate } },
        _sum: { total: true },
      }),
      prisma.saleReturn.aggregate({
        where: { branchId: req.branchId, createdAt: { gte: date, lt: nextDate }, status: "COMPLETED" },
        _sum: { total: true },
      }),
      prisma.expense.aggregate({
        where: { branchId: req.branchId, paidAt: { gte: date, lt: nextDate } },
        _sum: { amount: true },
      }),
      prisma.financialAccount.findMany({
        where: { branchId: req.branchId, type: "CASHBOX", isActive: true },
        select: { balance: true },
      }),
    ]);

    const salesTotal = D(sales._sum.total || 0);
    const returnsTotal = D(returns._sum.total || 0);
    const expensesTotal = D(expenses._sum.amount || 0);
    // Count every active cashbox; branches may operate more than one physical till.
    const expected = cashAccounts.reduce((sum, account) => sum.add(account.balance), D(0));

    const row = await prisma.dailyClosing.create({
      data: {
        branchId: req.branchId,
        userId: req.user.id,
        businessDate: date,
        salesTotal,
        returnsTotal,
        expensesTotal,
        cashExpected: expected,
        cashActual: actual,
        variance: actual.sub(expected),
        notes,
      },
      include: { user: { select: { name: true } } },
    });
    await audit(req.user, "DAILY_CLOSE", "DailyClosing", row.id, {
      date: date.toISOString(),
      salesTotal: String(salesTotal),
      returnsTotal: String(returnsTotal),
      expensesTotal: String(expensesTotal),
      cashExpected: String(expected),
      cashActual: String(actual),
      variance: String(row.variance),
    }, req.branchId);
    return res.status(201).json(row);
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ error: "تم إقفال هذا اليوم بالفعل" });
    console.error("[Daily closing create]", {
      branchId: req.branchId,
      userId: req.user?.id,
      code: error.code,
      message: error.message,
    });
    return res.status(error.status || 500).json({
      error: error.status ? error.message : "تعذر إقفال اليوم. راجع السجلات قبل إعادة المحاولة.",
    });
  }
});

export default router;
