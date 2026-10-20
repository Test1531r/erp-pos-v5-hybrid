import { Router } from "express";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "../index.js";
import { authenticate, authorize, requireBranch } from "../middleware/auth.js";
import { money } from "../utils/security.js";
import { audit } from "../utils/audit.js";
import { ensureDefaultAccounts, postMovement } from "../utils/finance.js";

const router = Router();
router.use(authenticate, requireBranch);
const financeRoles = ["SUPER_ADMIN", "BRANCH_MANAGER", "ACCOUNTANT"];

router.get("/accounts", async (req, res) => {
  try {
    await prisma.$transaction((tx) => ensureDefaultAccounts(tx, req.branchId));
    const accounts = await prisma.financialAccount.findMany({ where: { branchId: req.branchId }, orderBy: [{ isActive: "desc" }, { type: "asc" }, { name: "asc" }] });
    res.json(accounts);
  } catch (err) { res.status(500).json({ error: "تعذر تحميل الحسابات المالية" }); }
});

router.post("/accounts", authorize(...financeRoles), async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const code = String(req.body.code || "").trim().toUpperCase().replace(/\s+/g, "_");
    const validTypes = ["CASHBOX", "CARD", "BANK", "VODAFONE_CASH", "INSTAPAY", "WALLET", "OTHER"];
    if (!name || !code) return res.status(400).json({ error: "اسم وكود الحساب مطلوبان" });
    if (!validTypes.includes(req.body.type)) return res.status(400).json({ error: "نوع الحساب غير صالح" });
    const opening = money(req.body.openingBalance || 0, "الرصيد الافتتاحي");
    const account = await prisma.$transaction(async (tx) => {
      const created = await tx.financialAccount.create({ data: { branchId: req.branchId, name, code, type: req.body.type, allowNegative: !!req.body.allowNegative, notes: req.body.notes || null } });
      if (opening > 0) await postMovement(tx, { branchId: req.branchId, accountId: created.id, userId: req.user.id, type: "OPENING_BALANCE", amount: opening, direction: "IN", referenceType: "FinancialAccount", referenceId: created.id, description: "رصيد افتتاحي" });
      return tx.financialAccount.findUnique({ where: { id: created.id } });
    });
    await audit(req.user, "FINANCE_ACCOUNT_CREATE", "FinancialAccount", account.id, { name, type: req.body.type }, req.branchId);
    res.status(201).json(account);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "كود الحساب مستخدم داخل هذا الفرع" });
    res.status(err.status || 500).json({ error: err.status ? err.message : "تعذر إنشاء الحساب" });
  }
});

router.patch("/accounts/:id", authorize(...financeRoles), async (req, res) => {
  try {
    const existing = await prisma.financialAccount.findFirst({ where: { id: req.params.id, branchId: req.branchId } });
    if (!existing) return res.status(404).json({ error: "الحساب غير موجود" });
    const data = {};
    if (req.body.name !== undefined) data.name = String(req.body.name).trim().slice(0, 120);
    if (req.body.isActive !== undefined) data.isActive = !!req.body.isActive;
    if (req.body.allowNegative !== undefined) data.allowNegative = !!req.body.allowNegative;
    if (req.body.notes !== undefined) data.notes = req.body.notes ? String(req.body.notes).slice(0, 1000) : null;
    const account = await prisma.financialAccount.update({ where: { id: existing.id }, data });
    res.json(account);
  } catch { res.status(500).json({ error: "تعذر تعديل الحساب" }); }
});

router.get("/transactions", authorize(...financeRoles), async (req, res) => {
  try {
    const { accountId, type, from, to, search } = req.query;
    const where = { branchId: req.branchId };
    if (accountId) where.accountId = accountId;
    if (type) where.type = type;
    if (from || to) where.createdAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
    if (search) where.OR = [{ description: { contains: String(search), mode: "insensitive" } }, { notes: { contains: String(search), mode: "insensitive" } }];
    const transactions = await prisma.financialTransaction.findMany({ where, include: { account: { select: { id: true, name: true, type: true } }, user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: Math.min(Number(req.query.limit || 250), 500) });
    res.json(transactions);
  } catch { res.status(500).json({ error: "تعذر تحميل الحركات المالية" }); }
});

router.post("/transactions", authorize(...financeRoles), async (req, res) => {
  try {
    const direction = req.body.direction;
    if (!["IN", "OUT"].includes(direction)) return res.status(400).json({ error: "اختر داخل أو خارج" });
    const amount = money(req.body.amount, "المبلغ", { allowZero: false });
    const type = direction === "IN" ? (req.body.type || "OTHER_IN") : (req.body.type || "OTHER_OUT");
    const result = await prisma.$transaction((tx) => postMovement(tx, { branchId: req.branchId, accountId: req.body.accountId, userId: req.user.id, type, amount, direction, referenceType: "Manual", description: req.body.description || (direction === "IN" ? "إيداع / حركة داخلة" : "سحب / حركة خارجة"), notes: req.body.notes }));
    await audit(req.user, "FINANCE_MOVEMENT", "FinancialTransaction", result.movement.id, { direction, amount, accountId: req.body.accountId }, req.branchId);
    res.status(201).json(result);
  } catch (err) { res.status(err.status || 500).json({ error: err.status ? err.message : "تعذر تسجيل الحركة" }); }
});

router.post("/transfer", authorize(...financeRoles), async (req, res) => {
  try {
    const amount = money(req.body.amount, "المبلغ", { allowZero: false });
    if (!req.body.fromAccountId || !req.body.toAccountId || req.body.fromAccountId === req.body.toAccountId) return res.status(400).json({ error: "حدد حساب مصدر ووجهة مختلفين" });
    const group = randomUUID();
    const result = await prisma.$transaction(async (tx) => {
      const out = await postMovement(tx, { branchId: req.branchId, accountId: req.body.fromAccountId, userId: req.user.id, type: "TRANSFER_OUT", amount, direction: "OUT", transferGroupId: group, referenceType: "AccountTransfer", description: req.body.description || "تحويل بين حسابات", notes: req.body.notes });
      const inc = await postMovement(tx, { branchId: req.branchId, accountId: req.body.toAccountId, userId: req.user.id, type: "TRANSFER_IN", amount, direction: "IN", transferGroupId: group, referenceType: "AccountTransfer", description: req.body.description || "تحويل بين حسابات", notes: req.body.notes });
      return { out, in: inc, transferGroupId: group };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await audit(req.user, "FINANCE_TRANSFER", "FinancialTransaction", group, { amount, from: req.body.fromAccountId, to: req.body.toAccountId }, req.branchId);
    res.status(201).json(result);
  } catch (err) { res.status(err.status || 500).json({ error: err.status ? err.message : "تعذر تنفيذ التحويل" }); }
});

router.get("/summary", authorize(...financeRoles), async (req, res) => {
  try {
    await prisma.$transaction((tx) => ensureDefaultAccounts(tx, req.branchId));
    const start = req.query.from ? new Date(req.query.from) : new Date(new Date().setHours(0,0,0,0));
    const end = req.query.to ? new Date(req.query.to) : new Date();
    const [accounts, incoming, outgoing, movements] = await prisma.$transaction([
      prisma.financialAccount.findMany({ where: { branchId: req.branchId, isActive: true }, orderBy: { name: "asc" } }),
      prisma.financialTransaction.aggregate({ where: { branchId: req.branchId, direction: "IN", createdAt: { gte: start, lte: end }, isReversed: false }, _sum: { amount: true } }),
      prisma.financialTransaction.aggregate({ where: { branchId: req.branchId, direction: "OUT", createdAt: { gte: start, lte: end }, isReversed: false }, _sum: { amount: true } }),
      prisma.financialTransaction.groupBy({ by: ["type", "direction"], where: { branchId: req.branchId, createdAt: { gte: start, lte: end }, isReversed: false }, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);
    res.json({ from: start, to: end, accounts, totalBalance, incoming: Number(incoming._sum.amount || 0), outgoing: Number(outgoing._sum.amount || 0), net: Number(incoming._sum.amount || 0) - Number(outgoing._sum.amount || 0), movements });
  } catch { res.status(500).json({ error: "تعذر تحميل الملخص المالي" }); }
});

router.get("/shifts/current", async (req, res) => {
  const where = { branchId: req.branchId, status: "OPEN" };
  if (req.user.role === "CASHIER") where.userId = req.user.id;
  const shift = await prisma.cashierShift.findFirst({ where, include: { user: { select: { id: true, name: true } }, openingAccount: true }, orderBy: { openedAt: "desc" } });
  res.json(shift);
});

router.post("/shifts/open", authorize("SUPER_ADMIN", "BRANCH_MANAGER", "CASHIER", "ACCOUNTANT"), async (req, res) => {
  try {
    const openingBalance = money(req.body.openingBalance ?? 0, "رصيد بداية الوردية");
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.cashierShift.findFirst({ where: { branchId: req.branchId, userId: req.user.id, status: "OPEN" } });
      if (existing) throw Object.assign(new Error("لديك وردية مفتوحة بالفعل"), { status: 409 });
      await ensureDefaultAccounts(tx, req.branchId);
      let accountId = String(req.body.accountId || "");
      if (!accountId) {
        const defaultAccount = await tx.financialAccount.findFirst({ where: { branchId: req.branchId, type: "CASHBOX", isActive: true }, orderBy: { createdAt: "asc" } });
        accountId = defaultAccount?.id || "";
      }
      if (!accountId) throw Object.assign(new Error("لا يوجد حساب خزنة فعال لهذا الفرع"), { status: 422 });
      const account = await tx.financialAccount.findFirst({ where: { id: accountId, branchId: req.branchId, isActive: true, type: "CASHBOX" } });
      if (!account) throw Object.assign(new Error("اختر حساب خزنة نقدية فعالاً من نفس الفرع"), { status: 422 });
      return tx.cashierShift.create({ data: { branchId: req.branchId, userId: req.user.id, openingAccountId: account.id, openingBalance, openingNotes: req.body.notes ? String(req.body.notes).slice(0, 1000) : null } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await audit(req.user, "SHIFT_OPEN", "CashierShift", result.id, { openingBalance: String(openingBalance), accountId: result.openingAccountId }, req.branchId);
    return res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === "P2034") return res.status(409).json({ error: "وردية أخرى قيد الفتح. حدّث الصفحة وتحقق من حالة الوردية." });
    console.error("[Shift open]", { branchId: req.branchId, userId: req.user?.id, code: err.code, message: err.message });
    return res.status(500).json({ error: "تعذر فتح الوردية" });
  }
});

router.post("/shifts/:id/close", authorize("SUPER_ADMIN", "BRANCH_MANAGER", "CASHIER", "ACCOUNTANT"), async (req, res) => {
  try {
    const shift = await prisma.cashierShift.findFirst({ where: { id: req.params.id, branchId: req.branchId, status: "OPEN" } });
    if (!shift) return res.status(404).json({ error: "الوردية المفتوحة غير موجودة" });
    if (req.user.role === "CASHIER" && shift.userId !== req.user.id) return res.status(403).json({ error: "لا يمكنك إغلاق وردية مستخدم آخر" });
    const accountId = req.body.accountId || shift.openingAccountId;
    const account = accountId ? await prisma.financialAccount.findFirst({ where: { id: accountId, branchId: req.branchId, isActive: true, type: "CASHBOX" } }) : null;
    if (!account) return res.status(422).json({ error: "حساب الخزنة غير موجود أو غير فعال" });
    const actual = money(req.body.actualBalance, "الرصيد الفعلي");
    const closed = await prisma.$transaction(async (tx) => {
      const current = await tx.cashierShift.findFirst({ where: { id: shift.id, branchId: req.branchId, status: "OPEN" } });
      if (!current) throw Object.assign(new Error("تم إغلاق الوردية بالفعل"), { status: 409 });
      const movements = await tx.financialTransaction.findMany({ where: { branchId: req.branchId, accountId: account.id, userId: current.userId, createdAt: { gte: current.openedAt, lte: new Date() }, isReversed: false }, select: { amount: true, direction: true } });
      const movementNet = movements.reduce((sum, item) => sum + (item.direction === "IN" ? Number(item.amount) : -Number(item.amount)), 0);
      const expected = Number(current.openingBalance) + movementNet;
      const variance = actual - expected;
      return tx.cashierShift.update({ where: { id: current.id }, data: { status: "CLOSED", closingAccountId: account.id, expectedBalance: expected, actualBalance: actual, variance, closedAt: new Date(), closingNotes: req.body.notes ? String(req.body.notes).slice(0, 1000) : null } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await audit(req.user, "SHIFT_CLOSE", "CashierShift", shift.id, { expected: String(closed.expectedBalance), actual: String(closed.actualBalance), variance: String(closed.variance) }, req.branchId);
    return res.json(closed);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === "P2034") return res.status(409).json({ error: "تغيرت بيانات الوردية أثناء الإغلاق. حدّث الصفحة وحاول مرة أخرى." });
    console.error("[Shift close]", { branchId: req.branchId, userId: req.user?.id, shiftId: req.params.id, code: err.code, message: err.message });
    return res.status(500).json({ error: "تعذر إغلاق الوردية" });
  }
});

router.get("/shifts", authorize(...financeRoles), async (req, res) => {
  const shifts = await prisma.cashierShift.findMany({ where: { branchId: req.branchId }, include: { user: { select: { name: true } }, openingAccount: { select: { name: true } } }, orderBy: { openedAt: "desc" }, take: 100 });
  res.json(shifts);
});

export default router;
