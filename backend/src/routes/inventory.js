import { Router } from "express";
import { prisma, io } from "../index.js";
import { authenticate, authorize, requireBranch } from "../middleware/auth.js";
import { positiveInt } from "../utils/security.js";
import { audit } from "../utils/audit.js";

const router = Router();
router.use(authenticate);

router.get("/", requireBranch, async (req, res) => {
  try {
    const inventory = await prisma.inventory.findMany({
      where: { branchId: req.branchId },
      include: { product: { include: { category: { select: { name: true } } } }, branch: { select: { id: true, name: true, code: true } } },
      orderBy: { product: { name: "asc" } },
    });
    res.json(inventory);
  } catch (err) { res.status(500).json({ error: "تعذر تحميل المخزون" }); }
});

router.get("/low-stock", requireBranch, async (req, res) => {
  const all = await prisma.inventory.findMany({ where: { branchId: req.branchId }, include: { product: true, branch: { select: { name: true } } } });
  res.json(all.filter((inv) => inv.quantity <= inv.product.lowStockQty));
});

router.get("/imei/:imei", requireBranch, async (req, res) => {
  const record = await prisma.productIMEI.findUnique({ where: { imei: req.params.imei }, include: { product: { select: { id: true, name: true, sku: true } } } });
  if (!record || (req.user.role !== "SUPER_ADMIN" && record.branchId !== req.branchId)) return res.status(404).json({ error: "IMEI غير موجود في هذا الفرع" });
  res.json(record);
});

router.post("/adjust", authorize("SUPER_ADMIN", "BRANCH_MANAGER", "INVENTORY_MANAGER"), requireBranch, async (req, res) => {
  try {
    const { productId, type, reason } = req.body;
    if (!["ADD", "REMOVE", "SET"].includes(type)) return res.status(400).json({ error: "نوع التسوية غير صالح" });
    const quantity = type === "SET" ? Math.max(0, Number.parseInt(req.body.quantity, 10)) : positiveInt(req.body.quantity);
    if (!Number.isInteger(quantity)) return res.status(400).json({ error: "الكمية غير صالحة" });
    if (!String(reason || "").trim()) return res.status(400).json({ error: "سبب التسوية مطلوب" });

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId }, select: { id: true, name: true, hasIMEI: true } });
      if (!product) throw Object.assign(new Error("المنتج غير موجود"), { status: 404 });
      if (product.hasIMEI) throw Object.assign(new Error("تسوية منتجات IMEI تتم من خلال إدارة IMEI فقط"), { status: 400 });
      const current = await tx.inventory.findUnique({ where: { productId_branchId: { productId, branchId: req.branchId } } });
      const before = current?.quantity || 0;
      const after = type === "ADD" ? before + quantity : type === "REMOVE" ? before - quantity : quantity;
      if (after < 0) throw Object.assign(new Error(`لا يمكن جعل المخزون سالباً. المتاح ${before}`), { status: 422 });
      const inv = await tx.inventory.upsert({ where: { productId_branchId: { productId, branchId: req.branchId } }, create: { productId, branchId: req.branchId, quantity: after }, update: { quantity: after } });
      if (after !== before) await tx.stockMovement.create({ data: { branchId: req.branchId, productId, userId: req.user.id, type: after > before ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT", quantity: after - before, quantityBefore: before, quantityAfter: after, referenceType: "InventoryAdjustment", referenceId: inv.id, notes: String(reason).slice(0,1000) } });
      return { inv, before, after, productName: product.name };
    });

    await audit(req.user, "INVENTORY_ADJUST", "Inventory", result.inv.id, { productId, productName: result.productName, type, before: result.before, after: result.after, reason }, req.branchId);
    io.to(`branch:${req.branchId}`).emit("inventory:update", { productId, branchId: req.branchId, quantity: result.after });
    res.json(result.inv);
  } catch (err) { res.status(err.status || 500).json({ error: err.status ? err.message : "تعذر تعديل المخزون" }); }
});

router.post("/imei", authorize("SUPER_ADMIN", "BRANCH_MANAGER", "INVENTORY_MANAGER"), requireBranch, async (req, res) => {
  try {
    const { productId, imeiList } = req.body;
    if (!Array.isArray(imeiList) || !imeiList.length || imeiList.length > 500) return res.status(400).json({ error: "قائمة IMEI غير صالحة" });
    const normalized = imeiList.map((item) => ({ imei: String(item.imei || "").trim(), color: item.color ? String(item.color).trim() : null, storage: item.storage ? String(item.storage).trim() : null }));
    if (normalized.some((x) => x.imei.length < 8) || new Set(normalized.map((x) => x.imei)).size !== normalized.length) return res.status(400).json({ error: "يوجد IMEI فارغ/قصير أو مكرر في القائمة" });

    const created = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId }, select: { hasIMEI: true, name: true } });
      if (!product?.hasIMEI) throw Object.assign(new Error("المنتج غير مفعّل لتتبع IMEI"), { status: 400 });
      const existing = await tx.productIMEI.count({ where: { imei: { in: normalized.map((x) => x.imei) } } });
      if (existing) throw Object.assign(new Error("واحد أو أكثر من أرقام IMEI موجود بالفعل"), { status: 409 });
      const result = await tx.productIMEI.createMany({ data: normalized.map((item) => ({ ...item, productId, branchId: req.branchId, status: "IN_STOCK" })) });
      const beforeInv = await tx.inventory.findUnique({ where: { productId_branchId: { productId, branchId: req.branchId } } });
      const before = beforeInv?.quantity || 0;
      await tx.inventory.upsert({ where: { productId_branchId: { productId, branchId: req.branchId } }, create: { productId, branchId: req.branchId, quantity: result.count }, update: { quantity: { increment: result.count } } });
      await tx.stockMovement.create({ data: { branchId: req.branchId, productId, userId: req.user.id, type: "PURCHASE", quantity: result.count, quantityBefore: before, quantityAfter: before + result.count, referenceType: "IMEIReceive", referenceId: productId, notes: `استلام ${result.count} IMEI` } });
      return result.count;
    });
    await audit(req.user, "IMEI_RECEIVE", "Product", productId, { count: created }, req.branchId);
    io.to(`branch:${req.branchId}`).emit("inventory:refresh", { branchId: req.branchId, productId });
    res.status(201).json({ created });
  } catch (err) { res.status(err.status || 500).json({ error: err.status ? err.message : "تعذر إضافة IMEI" }); }
});

router.get("/movements", requireBranch, async (req, res) => {
  try {
    const where = { branchId: req.branchId };
    if (req.query.productId) where.productId = req.query.productId;
    if (req.query.type) where.type = req.query.type;
    const rows = await prisma.stockMovement.findMany({ where, include: { product: { select: { name: true, sku: true } }, user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: Math.min(Number(req.query.limit || 250), 500) });
    res.json(rows);
  } catch { res.status(500).json({ error: "تعذر تحميل سجل حركة المخزون" }); }
});

export default router;
