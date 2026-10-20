import { Router } from "express";
import { Prisma } from "@prisma/client";
import dayjs from "dayjs";
import { prisma, io } from "../index.js";
import { authenticate, authorize, requireBranch } from "../middleware/auth.js";
import { positiveInt } from "../utils/security.js";
import { audit } from "../utils/audit.js";
import { ensureDefaultAccounts, postMovement } from "../utils/finance.js";

const router = Router();
router.use(authenticate, authorize("SUPER_ADMIN", "BRANCH_MANAGER", "CASHIER", "ACCOUNTANT"), requireBranch);

router.get("/", async (req, res) => {
  try {
    const rows = await prisma.saleReturn.findMany({
      where: { branchId: req.branchId },
      include: {
        invoice: { select: { invoiceNumber: true } },
        user: { select: { name: true } },
        refundAccount: { select: { name: true, type: true } },
        items: { include: { product: { select: { name: true, sku: true } } } },
      },
      orderBy: { createdAt: "desc" }, take: 150,
    });
    res.json(rows);
  } catch { res.status(500).json({ error: "تعذر تحميل المرتجعات" }); }
});

router.get("/invoice/:invoiceId/available", async (req, res) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.invoiceId, branchId: req.branchId },
      include: { items: true, returns: { where: { status: "COMPLETED" }, include: { items: true } }, paymentSplits: { include: { account: true } } },
    });
    if (!invoice) return res.status(404).json({ error: "الفاتورة غير موجودة" });
    const returned = new Map();
    for (const r of invoice.returns) for (const item of r.items) returned.set(item.invoiceItemId, (returned.get(item.invoiceItemId) || 0) + item.quantity);
    const items = invoice.items.map((item) => ({ ...item, returnedQty: returned.get(item.id) || 0, availableQty: item.quantity - (returned.get(item.id) || 0) }));
    res.json({ ...invoice, items });
  } catch { res.status(500).json({ error: "تعذر تحميل بيانات الفاتورة" }); }
});

router.post("/", async (req, res) => {
  try {
    if (!Array.isArray(req.body.items) || !req.body.items.length) return res.status(400).json({ error: "اختر صنفاً واحداً على الأقل للمرتجع" });
    const invoiceId = req.body.invoiceId;
    const requestedItemIds = req.body.items.map((item) => String(item?.invoiceItemId || ""));
    if (requestedItemIds.some((id) => !id) || new Set(requestedItemIds).size !== requestedItemIds.length) {
      return res.status(400).json({ error: "لا تكرر صنف الفاتورة في نفس المرتجع" });
    }
    const requestedImeis = req.body.items.flatMap((item) => Array.isArray(item?.imeiNumbers) ? item.imeiNumbers.map((imei) => String(imei).trim()) : []);
    if (requestedImeis.some((imei) => !imei) || new Set(requestedImeis).size !== requestedImeis.length) {
      return res.status(400).json({ error: "أرقام IMEI مفقودة أو مكررة في طلب المرتجع" });
    }
    const created = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, branchId: req.branchId }, include: { items: true, returns: { where: { status: "COMPLETED" }, include: { items: true } }, paymentSplits: true } });
      if (!invoice) throw Object.assign(new Error("الفاتورة غير موجودة في هذا الفرع"), { status: 404 });
      const prior = new Map();
      for (const ret of invoice.returns) for (const it of ret.items) prior.set(it.invoiceItemId, (prior.get(it.invoiceItemId) || 0) + it.quantity);
      const invoiceMap = new Map(invoice.items.map((x) => [x.id, x]));
      const ratio = new Prisma.Decimal(invoice.subtotal).greaterThan(0) ? new Prisma.Decimal(invoice.total).div(invoice.subtotal) : new Prisma.Decimal(1);
      const returnItems = [];
      let total = new Prisma.Decimal(0);

      for (const raw of req.body.items) {
        const source = invoiceMap.get(raw.invoiceItemId);
        if (!source) throw Object.assign(new Error("أحد أصناف المرتجع لا ينتمي إلى الفاتورة"), { status: 422 });
        const qty = positiveInt(raw.quantity);
        const available = source.quantity - (prior.get(source.id) || 0);
        if (qty > available) throw Object.assign(new Error(`الكمية المرتجعة من ${source.productName} أكبر من المتاح (${available})`), { status: 422 });
        const imeis = Array.isArray(raw.imeiNumbers) ? raw.imeiNumbers.map(String) : [];
        if (source.imeiNumbers?.length) {
          if (imeis.length !== qty) throw Object.assign(new Error(`حدد ${qty} IMEI للمرتجع من ${source.productName}`), { status: 422 });
          if (imeis.some((i) => !source.imeiNumbers.includes(i))) throw Object.assign(new Error("IMEI غير موجود في الفاتورة الأصلية"), { status: 422 });
          const imeiRows = await tx.productIMEI.findMany({ where: { imei: { in: imeis }, productId: source.productId, branchId: req.branchId, status: "SOLD", saleInvoiceId: invoice.id } });
          if (imeiRows.length !== imeis.length) throw Object.assign(new Error("أحد أرقام IMEI لم يعد صالحاً للمرتجع"), { status: 409 });
        }
        const baseUnit = new Prisma.Decimal(source.lineTotal).div(source.quantity);
        const unitRefund = baseUnit.mul(ratio);
        const lineRefund = unitRefund.mul(qty);
        total = total.add(lineRefund);
        returnItems.push({ source, quantity: qty, unitRefund, lineRefund, imeis });
      }

      await ensureDefaultAccounts(tx, req.branchId);
      let refundAccountId = req.body.refundAccountId || invoice.paymentSplits?.[0]?.accountId;
      if (!refundAccountId) refundAccountId = (await tx.financialAccount.findFirst({ where: { branchId: req.branchId, type: "CASHBOX", isActive: true } }))?.id;
      if (!refundAccountId) throw Object.assign(new Error("حدد حساب رد المبلغ"), { status: 422 });

      const prefix = `RET-${dayjs().format("YYYYMMDD")}`;
      const last = await tx.saleReturn.findFirst({ where: { returnNumber: { startsWith: prefix } }, orderBy: { returnNumber: "desc" } });
      const seq = last ? (Number(last.returnNumber.split("-").pop()) || 0) + 1 : 1;
      const ret = await tx.saleReturn.create({ data: { returnNumber: `${prefix}-${String(seq).padStart(4,"0")}`, invoiceId: invoice.id, branchId: req.branchId, userId: req.user.id, total, refundAccountId, reason: req.body.reason ? String(req.body.reason).slice(0,300) : null, notes: req.body.notes ? String(req.body.notes).slice(0,1000) : null } });

      for (const item of returnItems) {
        await tx.saleReturnItem.create({ data: { saleReturnId: ret.id, invoiceItemId: item.source.id, productId: item.source.productId, quantity: item.quantity, unitRefund: item.unitRefund, lineRefund: item.lineRefund, imeiNumbers: item.imeis } });
        const inv = await tx.inventory.upsert({ where: { productId_branchId: { productId: item.source.productId, branchId: req.branchId } }, create: { productId: item.source.productId, branchId: req.branchId, quantity: item.quantity }, update: { quantity: { increment: item.quantity } } });
        const before = inv.quantity - item.quantity;
        await tx.stockMovement.create({ data: { branchId: req.branchId, productId: item.source.productId, userId: req.user.id, type: "SALE_RETURN", quantity: item.quantity, quantityBefore: before, quantityAfter: inv.quantity, referenceType: "SaleReturn", referenceId: ret.id, notes: req.body.reason || null } });
        if (item.imeis.length) await tx.productIMEI.updateMany({ where: { imei: { in: item.imeis }, saleInvoiceId: invoice.id }, data: { status: "IN_STOCK", saleInvoiceId: null, soldAt: null } });
      }
      const refundMovement = await postMovement(tx, { branchId: req.branchId, accountId: refundAccountId, userId: req.user.id, type: "SALE_REFUND", amount: total, direction: "OUT", referenceType: "SaleReturn", referenceId: ret.id, description: `مرتجع الفاتورة ${invoice.invoiceNumber}` });
      if (refundMovement.account.type === "CASHBOX") await tx.branch.update({ where: { id: req.branchId }, data: { cashboxBalance: { decrement: total } } });
      if (invoice.customerId) await tx.customer.update({ where: { id: invoice.customerId }, data: { totalSpent: { decrement: total } } });
      return tx.saleReturn.findUnique({ where: { id: ret.id }, include: { items: { include: { product: { select: { name: true, sku: true } } } }, refundAccount: true, invoice: { select: { invoiceNumber: true } } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });

    for (const item of created.items) {
      const inv = await prisma.inventory.findUnique({ where: { productId_branchId: { productId: item.productId, branchId: req.branchId } } });
      io.to(`branch:${req.branchId}`).emit("inventory:update", { productId: item.productId, branchId: req.branchId, quantity: inv?.quantity || 0 });
    }
    await audit(req.user, "SALE_RETURN", "SaleReturn", created.id, { returnNumber: created.returnNumber, total: String(created.total) }, req.branchId);
    res.status(201).json(created);
  } catch (err) {
    console.error("[Return]", err);
    res.status(err.status || 500).json({ error: err.status ? err.message : "تعذر تنفيذ المرتجع" });
  }
});

export default router;
