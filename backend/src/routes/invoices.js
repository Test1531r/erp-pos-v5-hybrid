import { Router } from "express";
import dayjs from "dayjs";
import { prisma } from "../index.js";
import { authenticate } from "../middleware/auth.js";
import { pageParams } from "../utils/security.js";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res) => {
  try {
    const { from, to, search } = req.query;
    const { page, limit, skip } = pageParams(req.query, 20, 100);
    const where = req.branchId ? { branchId: req.branchId } : {};
    if (search) where.invoiceNumber = { contains: String(search), mode: "insensitive" };
    if (from || to) { where.createdAt = {}; if (from) where.createdAt.gte = dayjs(from).startOf("day").toDate(); if (to) where.createdAt.lte = dayjs(to).endOf("day").toDate(); }
    const [invoices, total] = await prisma.$transaction([
      prisma.invoice.findMany({ where, include: { cashier: { select: { name: true } }, customer: { select: { name: true } }, _count: { select: { items: true } } }, orderBy: { createdAt: "desc" }, skip, take: limit }),
      prisma.invoice.count({ where }),
    ]);
    res.json({ invoices, total, page, pages: Math.ceil(total / limit) });
  } catch { res.status(500).json({ error: "تعذر تحميل الفواتير" }); }
});

router.get("/:id", async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: { items: true, paymentSplits: { include: { account: { select: { id: true, name: true, type: true } } } }, returns: { where: { status: "COMPLETED" }, include: { items: true } }, cashier: { select: { name: true } }, customer: true, branch: { select: { name: true, address: true, phone: true, taxNumber: true } } } });
  if (!invoice || (req.user.role !== "SUPER_ADMIN" && invoice.branchId !== req.user.branchId)) return res.status(404).json({ error: "الفاتورة غير موجودة" });
  res.json(invoice);
});

export default router;
