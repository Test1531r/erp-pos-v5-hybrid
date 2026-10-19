import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../index.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { io } from "../index.js";
import dayjs from "dayjs";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const branchId = req.branchId;
    const where = {};
    if (branchId) where.OR = [{ sourceBranchId: branchId }, { destBranchId: branchId }];
    if (status) where.status = status;
    const pageNumber = Math.max(1, Math.min(1000000, Number.parseInt(page, 10) || 1));
    const pageSize = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 20));
    const skip = (pageNumber - 1) * pageSize;
    const [transfers, total] = await prisma.$transaction([
      prisma.stockTransfer.findMany({ where, include: { sourceBranch: { select: { name: true } }, destBranch: { select: { name: true } }, requestedBy: { select: { name: true } }, _count: { select: { items: true } } }, orderBy: { createdAt: "desc" }, skip, take: pageSize }),
      prisma.stockTransfer.count({ where }),
    ]);
    res.json({ transfers, total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/", authorize("SUPER_ADMIN", "BRANCH_MANAGER", "INVENTORY_MANAGER"), async (req, res) => {
  try {
    const { destBranchId, items, notes } = req.body;
    const sourceBranchId = req.branchId;
    if (!sourceBranchId) return res.status(400).json({ error: "يجب تحديد الفرع المصدر أولاً" });
    if (!destBranchId || typeof destBranchId !== "string") return res.status(400).json({ error: "يجب تحديد الفرع الوجهة" });
    if (sourceBranchId === destBranchId) return res.status(400).json({ error: "الفرع المصدر والوجهة لا يمكن أن يكونا نفس الفرع" });
    if (!Array.isArray(items) || items.length === 0 || items.length > 100) return res.status(400).json({ error: "أضف من صنف واحد إلى 100 صنف للتحويل" });
    if (new Set(items.map((item) => item?.productId)).size !== items.length) return res.status(400).json({ error: "لا تكرر نفس المنتج في أكثر من سطر؛ اجمع الكمية وأرقام IMEI في سطر واحد" });
    for (const item of items) {
      if (!item?.productId || !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) <= 0) {
        return res.status(400).json({ error: "بيانات الصنف أو الكمية غير صالحة" });
      }
      if (item.imeiNumbers !== undefined && (!Array.isArray(item.imeiNumbers) || item.imeiNumbers.some((v) => typeof v !== "string" || !v.trim()))) {
        return res.status(400).json({ error: "قائمة IMEI غير صالحة" });
      }
    }
    const [branch, destination] = await Promise.all([
      prisma.branch.findFirst({ where: { id: sourceBranchId, isActive: true }, select: { code: true } }),
      prisma.branch.findFirst({ where: { id: destBranchId, isActive: true }, select: { id: true } }),
    ]);
    if (!branch || !destination) return res.status(400).json({ error: "الفرع المصدر أو الوجهة غير موجود أو غير فعال" });
    const today = dayjs().format("YYYYMMDD");
    const prefix = `TRF-${branch.code}-${today}`;
    const last = await prisma.stockTransfer.findFirst({ where: { referenceNumber: { startsWith: prefix } }, orderBy: { referenceNumber: "desc" } });
    const seq = last ? parseInt(last.referenceNumber.split("-").pop()) + 1 : 1;
    const referenceNumber = `${prefix}-${String(seq).padStart(4, "0")}`;

    const transfer = await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const product = await tx.product.findFirst({ where: { id: item.productId, isActive: true }, select: { name: true, hasIMEI: true } });
        if (!product) throw Object.assign(new Error("أحد المنتجات غير موجود أو غير فعال"), { status: 422 });
        const imeis = Array.isArray(item.imeiNumbers) ? item.imeiNumbers.map((v) => v.trim()) : [];
        if (product.hasIMEI) {
          if (imeis.length !== Number(item.quantity) || new Set(imeis).size !== imeis.length) {
            throw Object.assign(new Error(`يجب تحديد أرقام IMEI فريدة بعدد الكمية للمنتج "${product.name}"`), { status: 422 });
          }
          const available = await tx.productIMEI.findMany({
            where: { imei: { in: imeis }, productId: item.productId, branchId: sourceBranchId, status: "IN_STOCK" },
            select: { imei: true },
          });
          if (available.length !== imeis.length) throw Object.assign(new Error(`أحد أرقام IMEI للمنتج "${product.name}" غير متاح في الفرع المصدر`), { status: 422 });
        } else if (imeis.length) {
          throw Object.assign(new Error(`المنتج "${product.name}" لا يستخدم أرقام IMEI`), { status: 422 });
        }
        const inv = await tx.inventory.findUnique({ where: { productId_branchId: { productId: item.productId, branchId: sourceBranchId } } });
        if (!inv || inv.quantity < Number(item.quantity)) {
          throw Object.assign(new Error(`مخزون غير كافٍ للمنتج "${product.name}"`), { status: 422 });
        }
      }
      return tx.stockTransfer.create({
        data: { referenceNumber, sourceBranchId, destBranchId, requestedById: req.user.id, status: "PENDING", notes, items: { create: items.map((i) => ({ productId: i.productId, quantity: i.quantity, imeiNumbers: i.imeiNumbers || [] })) } },
        include: { sourceBranch: { select: { name: true } }, destBranch: { select: { name: true } }, items: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    io.to(`branch:${sourceBranchId}`).emit("transfer:update", { type: "created", transfer });
    io.to(`branch:${destBranchId}`).emit("transfer:update", { type: "created", transfer });
    res.status(201).json(transfer);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.message.includes("مخزون")) return res.status(422).json({ error: err.message });
    res.status(500).json({ error: "تعذر إنشاء تحويل المخزون" });
  }
});

router.put("/:id/status", authorize("SUPER_ADMIN", "BRANCH_MANAGER", "INVENTORY_MANAGER"), async (req, res) => {
  try {
    const { status } = req.body;
    if (!["COMPLETED", "CANCELLED"].includes(status)) return res.status(400).json({ error: "الحالة غير صالحة" });
    const transfer = await prisma.stockTransfer.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!transfer) return res.status(404).json({ error: "التحويل غير موجود" });
    if (transfer.status !== "PENDING") return res.status(409).json({ error: "لا يمكن تغيير تحويل تم إغلاقه مسبقاً" });
    if (req.user.role !== "SUPER_ADMIN" && ![transfer.sourceBranchId, transfer.destBranchId].includes(req.user.branchId)) return res.status(403).json({ error: "ليس لديك صلاحية على هذا التحويل" });

    const updated = await prisma.$transaction(async (tx) => {
      const data = { status, updatedAt: new Date() };
      if (status === "COMPLETED") {
        data.completedAt = new Date();
        for (const item of transfer.items) {
          const srcBefore = await tx.inventory.findUnique({ where: { productId_branchId: { productId: item.productId, branchId: transfer.sourceBranchId } } });
          if (!srcBefore || srcBefore.quantity < item.quantity) throw Object.assign(new Error("مخزون المصدر تغير وأصبح غير كافٍ"), { status: 409 });
          const destBefore = await tx.inventory.findUnique({ where: { productId_branchId: { productId: item.productId, branchId: transfer.destBranchId } } });
          await tx.inventory.update({ where: { productId_branchId: { productId: item.productId, branchId: transfer.sourceBranchId } }, data: { quantity: { decrement: item.quantity } } });
          await tx.inventory.upsert({ where: { productId_branchId: { productId: item.productId, branchId: transfer.destBranchId } }, create: { productId: item.productId, branchId: transfer.destBranchId, quantity: item.quantity }, update: { quantity: { increment: item.quantity } } });
          await tx.stockMovement.create({ data: { branchId: transfer.sourceBranchId, productId: item.productId, userId: req.user.id, type: "TRANSFER_OUT", quantity: -item.quantity, quantityBefore: srcBefore.quantity, quantityAfter: srcBefore.quantity - item.quantity, referenceType: "StockTransfer", referenceId: transfer.id, notes: transfer.referenceNumber } });
          await tx.stockMovement.create({ data: { branchId: transfer.destBranchId, productId: item.productId, userId: req.user.id, type: "TRANSFER_IN", quantity: item.quantity, quantityBefore: destBefore?.quantity || 0, quantityAfter: (destBefore?.quantity || 0) + item.quantity, referenceType: "StockTransfer", referenceId: transfer.id, notes: transfer.referenceNumber } });
          if (item.imeiNumbers.length) {
            if (new Set(item.imeiNumbers).size !== item.imeiNumbers.length || item.imeiNumbers.length !== item.quantity) {
              throw Object.assign(new Error("أرقام IMEI مكررة أو لا تطابق كمية التحويل"), { status: 422 });
            }
            const eligibleImeis = await tx.productIMEI.findMany({
              where: {
                imei: { in: item.imeiNumbers },
                productId: item.productId,
                branchId: transfer.sourceBranchId,
                status: "IN_STOCK",
              },
              select: { imei: true },
            });
            if (eligibleImeis.length !== item.imeiNumbers.length) {
              throw Object.assign(new Error("أحد أرقام IMEI غير متاح لهذا المنتج في الفرع المصدر"), { status: 409 });
            }
            const movedImeis = await tx.productIMEI.updateMany({
              where: {
                imei: { in: item.imeiNumbers },
                productId: item.productId,
                branchId: transfer.sourceBranchId,
                status: "IN_STOCK",
              },
              data: { branchId: transfer.destBranchId, status: "IN_STOCK" },
            });
            if (movedImeis.count !== item.imeiNumbers.length) {
              throw Object.assign(new Error("تعذر نقل كل أرقام IMEI المطلوبة"), { status: 409 });
            }
          }
        }
      }
      return tx.stockTransfer.update({ where: { id: req.params.id }, data, include: { sourceBranch: { select: { name: true } }, destBranch: { select: { name: true } } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    io.to(`branch:${transfer.sourceBranchId}`).emit("transfer:update", { type: "status", transfer: updated });
    io.to(`branch:${transfer.destBranchId}`).emit("transfer:update", { type: "status", transfer: updated });
    res.json(updated);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

export default router;
