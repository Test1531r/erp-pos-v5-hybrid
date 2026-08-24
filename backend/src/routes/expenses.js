import { Router } from "express";
import { prisma } from "../index.js";
import { authenticate, authorize, requireBranch } from "../middleware/auth.js";
import { money } from "../utils/security.js";
import { audit } from "../utils/audit.js";
import { ensureDefaultAccounts, postMovement } from "../utils/finance.js";

const router = Router();
router.use(authenticate);
router.get("/", requireBranch, async (req, res) => {
  const where = { branchId: req.branchId };
  const [expenses, agg] = await prisma.$transaction([prisma.expense.findMany({ where, include: { user: { select: { name: true } }, financialTransaction: { include: { account: { select: { id: true, name: true, type: true } } } } }, orderBy: { paidAt: "desc" }, take: 100 }), prisma.expense.aggregate({ where, _sum: { amount: true } })]);
  res.json({ expenses, total: agg._sum.amount || 0 });
});
router.post("/", authorize("SUPER_ADMIN", "BRANCH_MANAGER", "ACCOUNTANT"), requireBranch, async (req, res) => {
  try {
    const description = String(req.body.description || "").trim();
    if (!description) return res.status(400).json({ error: "وصف المصروف مطلوب" });
    const amount = money(req.body.amount, "المبلغ", { allowZero: false });
    const settings = await prisma.branchSetting.upsert({ where: { branchId: req.branchId }, create: { branchId: req.branchId }, update: {} });
    if (settings.requireApprovalExpenseAbove && Number(amount) > Number(settings.requireApprovalExpenseAbove) && !["SUPER_ADMIN","BRANCH_MANAGER"].includes(req.user.role)) {
      const approval = await prisma.approvalRequest.create({ data: { branchId: req.branchId, requestedById: req.user.id, entityType: "EXPENSE", action: "CREATE_EXPENSE", amount, reason: `مصروف يتجاوز حد الموافقة: ${description}`, payload: { category: req.body.category || "OTHER", description: description.slice(0,500), amount: Number(amount), accountId: req.body.accountId || null, paidAt: req.body.paidAt || null } } });
      await audit(req.user, "EXPENSE_APPROVAL_REQUEST", "ApprovalRequest", approval.id, { amount, description }, req.branchId);
      return res.status(202).json({ approvalRequired: true, approval, message: "تم إرسال المصروف للموافقة" });
    }
    const expense = await prisma.$transaction(async (tx) => {
      await ensureDefaultAccounts(tx, req.branchId);
      let accountId = req.body.accountId;
      if (!accountId) accountId = (await tx.financialAccount.findFirst({ where: { branchId: req.branchId, type: "CASHBOX", isActive: true } }))?.id;
      if (!accountId) throw Object.assign(new Error("حدد حساب دفع المصروف"), { status: 422 });
      const created = await tx.expense.create({ data: { category: req.body.category || "OTHER", description: description.slice(0, 500), amount, paidAt: req.body.paidAt ? new Date(req.body.paidAt) : new Date(), branchId: req.branchId, userId: req.user.id } });
      const movement = await postMovement(tx, { branchId: req.branchId, accountId, userId: req.user.id, type: "EXPENSE", amount, direction: "OUT", referenceType: "Expense", referenceId: created.id, description });
      await tx.expense.update({ where: { id: created.id }, data: { financialTransactionId: movement.movement.id } });
      if (movement.account.type === "CASHBOX") await tx.branch.update({ where: { id: req.branchId }, data: { cashboxBalance: { decrement: amount } } });
      return tx.expense.findUnique({ where: { id: created.id }, include: { financialTransaction: { include: { account: true } } } });
    });
    await audit(req.user, "CREATE", "Expense", expense.id, { amount: String(expense.amount), description, accountId: expense.financialTransaction?.accountId }, req.branchId);
    res.status(201).json(expense);
  } catch (err) { res.status(err.status || 500).json({ error: err.status ? err.message : "تعذر إضافة المصروف" }); }
});
export default router;
