import { Router } from "express";
import { Prisma } from "@prisma/client";
import dayjs from "dayjs";
import { prisma, io } from "../index.js";
import { authenticate, authorize, requireBranch } from "../middleware/auth.js";
import { positiveInt, money } from "../utils/security.js";
import { audit } from "../utils/audit.js";
import { ensureDefaultAccounts, resolvePaymentAccount, postMovement } from "../utils/finance.js";

const router = Router();
router.use(authenticate, authorize("SUPER_ADMIN", "BRANCH_MANAGER", "CASHIER"), requireBranch);
const METHODS = ["CASH", "CARD", "BANK_TRANSFER", "VODAFONE_CASH", "INSTAPAY"];
const decimal = (value) => new Prisma.Decimal(value);

router.post("/checkout", async (req, res) => {
  const branchId = req.branchId;
  try {
    const { items, customerId, discountAmount = 0, taxRate = 0, notes } = req.body;
    const clientOperationId = req.body.clientOperationId ? String(req.body.clientOperationId).trim().slice(0, 100) : null;
    if (clientOperationId) {
      const existing = await prisma.invoice.findUnique({ where: { clientOperationId }, include: { items: true, customer: { select: { id: true, name: true } }, branch: { select: { id: true, name: true, code: true } }, paymentSplits: { include: { account: { select: { id: true, name: true, type: true } } } } } });
      if (existing) {
        if (existing.branchId !== branchId) return res.status(409).json({ error: "معرّف العملية مستخدم في فرع آخر" });
        return res.json({ invoice: existing, change: Number(existing.changeGiven), duplicate: true, message: "العملية متزامنة بالفعل" });
      }
    }
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "السلة فارغة" });
    if (items.length > 100) return res.status(400).json({ error: "عدد أصناف الفاتورة أكبر من الحد المسموح" });
    const extraDiscountN = money(discountAmount, "الخصم");
    const taxRateN = money(taxRate, "الضريبة");
    if (taxRateN > 100) return res.status(400).json({ error: "نسبة الضريبة غير صالحة" });

    const branch = await prisma.branch.findFirst({ where: { id: branchId, isActive: true }, select: { code: true } });
    if (!branch) return res.status(400).json({ error: "الفرع غير موجود أو غير فعال" });
    const prefix = `INV-${branch.code}-${dayjs().format("YYYYMMDD")}`;
    const branchSettings = await prisma.branchSetting.upsert({ where: { branchId }, create: { branchId }, update: {} });
    if (branchSettings.requireShiftForPOS && req.user.role === "CASHIER") {
      const openShift = await prisma.cashierShift.findFirst({ where: { branchId, userId: req.user.id, status: "OPEN" } });
      if (!openShift) return res.status(409).json({ error: "يجب فتح وردية الكاشير قبل تنفيذ عملية بيع" });
    }

    const result = await prisma.$transaction(async (tx) => {
      await ensureDefaultAccounts(tx, branchId);
      const last = await tx.invoice.findFirst({ where: { invoiceNumber: { startsWith: prefix } }, orderBy: { invoiceNumber: "desc" }, select: { invoiceNumber: true } });
      const seq = last ? (Number.parseInt(last.invoiceNumber.split("-").pop(), 10) || 0) + 1 : 1;
      const invoiceNumber = `${prefix}-${String(seq).padStart(4, "0")}`;

      let subtotal = decimal(0);
      const lineItems = [];
      const seenImeis = new Set();
      for (const raw of items) {
        const quantity = positiveInt(raw.quantity);
        const product = await tx.product.findFirst({ where: { id: raw.productId, isActive: true }, select: { id: true, name: true, sku: true, costPrice: true, salePrice: true, hasIMEI: true, lowStockQty: true } });
        if (!product) throw Object.assign(new Error("أحد المنتجات غير موجود أو غير فعال"), { status: 422 });
        const inv = await tx.inventory.findUnique({ where: { productId_branchId: { productId: product.id, branchId } } });
        if (!inv || inv.quantity < quantity) throw Object.assign(new Error(`مخزون غير كافٍ للمنتج "${product.name}". المتاح: ${inv?.quantity || 0}`), { status: 422 });

        const imeiNumbers = Array.isArray(raw.imeiNumbers) ? raw.imeiNumbers.map(String) : [];
        if (product.hasIMEI) {
          if (imeiNumbers.length !== quantity) throw Object.assign(new Error(`مطلوب ${quantity} رقم IMEI للمنتج "${product.name}"`), { status: 422 });
          if (new Set(imeiNumbers).size !== imeiNumbers.length) throw Object.assign(new Error(`يوجد IMEI مكرر للمنتج "${product.name}"`), { status: 422 });
          for (const imei of imeiNumbers) {
            if (seenImeis.has(imei)) throw Object.assign(new Error(`IMEI ${imei} مكرر داخل الفاتورة`), { status: 422 });
            seenImeis.add(imei);
          }
          const records = await tx.productIMEI.findMany({ where: { imei: { in: imeiNumbers }, productId: product.id, branchId, status: "IN_STOCK" }, select: { imei: true } });
          if (records.length !== imeiNumbers.length) throw Object.assign(new Error(`واحد أو أكثر من أرقام IMEI للمنتج "${product.name}" غير متاح في هذا الفرع`), { status: 422 });
        }

        const requestedPrice = money(raw.unitPrice ?? product.salePrice, "سعر البيع");
        const unitPrice = decimal(requestedPrice);
        const discountPctN = money(raw.discountPct || 0, "خصم الصنف");
        if (discountPctN > 100) throw Object.assign(new Error("نسبة خصم الصنف غير صالحة"), { status: 400 });
        if (req.user.role === "CASHIER" && discountPctN > Number(req.user.maxDiscountPct || 0)) throw Object.assign(new Error(`الخصم على "${product.name}" يتجاوز حدك المسموح (${Number(req.user.maxDiscountPct || 0)}%)`), { status: 403 });
        if (req.user.role === "CASHIER" && !unitPrice.equals(product.salePrice)) throw Object.assign(new Error(`لا تملك صلاحية تعديل سعر "${product.name}"`), { status: 403 });
        const discPct = decimal(discountPctN);
        const gross = unitPrice.mul(quantity);
        const lineTotal = gross.sub(gross.mul(discPct).div(100));
        subtotal = subtotal.add(lineTotal);
        lineItems.push({ productId: product.id, productName: product.name, sku: product.sku, quantity, unitPrice, costPrice: product.costPrice, discountPct: discPct, lineTotal, imeiNumbers, stockBefore: inv.quantity, lowStockQty: product.lowStockQty });
      }

      let promotion = null;
      let promoDiscount = decimal(0);
      const promotionCode = req.body.promotionCode ? String(req.body.promotionCode).trim().toUpperCase() : null;
      if (promotionCode) {
        promotion = await tx.promotion.findUnique({ where: { code: promotionCode }, include: { products: true } });
        const now = new Date();
        if (!promotion || !promotion.isActive || promotion.startsAt > now || promotion.endsAt < now) throw Object.assign(new Error("كود العرض غير صالح أو منتهي"), { status: 422 });
        if (promotion.usageLimit && promotion.usedCount >= promotion.usageLimit) throw Object.assign(new Error("تم الوصول للحد الأقصى لاستخدام العرض"), { status: 422 });
        if (subtotal.lessThan(promotion.minTotal)) throw Object.assign(new Error(`الحد الأدنى للعرض ${decimal(promotion.minTotal).toFixed(2)}`), { status: 422 });
        const eligibleIds = new Set(promotion.products.map(x => x.productId));
        const eligible = eligibleIds.size ? lineItems.filter(x => eligibleIds.has(x.productId)).reduce((sum,x)=>sum.add(x.lineTotal), decimal(0)) : subtotal;
        if (eligible.lessThanOrEqualTo(0)) throw Object.assign(new Error("لا توجد منتجات مؤهلة لهذا العرض"), { status: 422 });
        promoDiscount = promotion.type === "PERCENT" ? eligible.mul(promotion.value).div(100) : decimal(promotion.value);
        if (promoDiscount.greaterThan(eligible)) promoDiscount = eligible;
      }
      const manualDiscount = decimal(extraDiscountN);
      if (req.user.role === "CASHIER" && subtotal.greaterThan(0) && manualDiscount.mul(100).div(subtotal).greaterThan(Number(req.user.maxDiscountPct || 0))) throw Object.assign(new Error(`الخصم الإجمالي يتجاوز حدك المسموح (${Number(req.user.maxDiscountPct || 0)}%)`), { status: 403 });
      let loyaltyPointsToRedeem = Math.max(0, Number.parseInt(req.body.redeemPoints || 0, 10) || 0);
      let loyaltyDiscount = decimal(0);
      if (loyaltyPointsToRedeem > 0) {
        if (!customerId) throw Object.assign(new Error("استبدال النقاط يتطلب اختيار عميل"), { status: 400 });
        const loyaltyCustomer = await tx.customer.findUnique({ where: { id: customerId }, select: { loyaltyPoints: true } });
        if (!loyaltyCustomer || loyaltyCustomer.loyaltyPoints < loyaltyPointsToRedeem) throw Object.assign(new Error("رصيد نقاط العميل غير كافٍ"), { status: 422 });
        const pointValue = decimal(branchSettings.loyaltyRedeemPointValue || 0);
        if (pointValue.lessThanOrEqualTo(0)) throw Object.assign(new Error("استبدال نقاط الولاء غير مفعّل في إعدادات الفرع"), { status: 422 });
        loyaltyDiscount = pointValue.mul(loyaltyPointsToRedeem);
      }
      const extraDiscount = manualDiscount.add(promoDiscount).add(loyaltyDiscount);
      if (extraDiscount.greaterThan(subtotal)) throw Object.assign(new Error("الخصم الإجمالي لا يمكن أن يتجاوز قيمة الفاتورة"), { status: 400 });
      const afterDiscount = subtotal.sub(extraDiscount);
      const taxAmount = afterDiscount.mul(decimal(taxRateN)).div(100);
      const total = afterDiscount.add(taxAmount);

      let splitInput = Array.isArray(req.body.paymentSplits) ? req.body.paymentSplits : [];
      let paid = total;
      let change = decimal(0);
      let paymentMethod = req.body.paymentMethod || "CASH";
      if (splitInput.length) {
        if (splitInput.length > 10) throw Object.assign(new Error("عدد طرق الدفع أكبر من المسموح"), { status: 400 });
        const seenAccounts = new Set();
        const parsed = [];
        let splitTotal = decimal(0);
        for (const raw of splitInput) {
          if (!METHODS.includes(raw.method)) throw Object.assign(new Error("طريقة دفع داخل التقسيم غير صالحة"), { status: 400 });
          const amount = decimal(money(raw.amount, "قيمة الدفع", { allowZero: false }));
          const account = await resolvePaymentAccount(tx, branchId, raw.method, raw.accountId);
          const key = `${raw.method}:${account.id}`;
          if (seenAccounts.has(key)) throw Object.assign(new Error("تم تكرار نفس حساب الدفع، اجمع المبلغ في سطر واحد"), { status: 400 });
          seenAccounts.add(key);
          parsed.push({ method: raw.method, amount, account, reference: raw.reference ? String(raw.reference).slice(0,150) : null });
          splitTotal = splitTotal.add(amount);
        }
        if (splitTotal.sub(total).abs().greaterThan(decimal("0.01"))) throw Object.assign(new Error(`إجمالي المدفوع (${splitTotal.toFixed(2)}) يجب أن يساوي إجمالي الفاتورة (${total.toFixed(2)})`), { status: 400 });
        splitInput = parsed;
        paid = splitTotal;
        paymentMethod = parsed.length > 1 ? "MIXED" : parsed[0].method;
      } else {
        if (paymentMethod === "CREDIT") {
          if (!customerId) throw Object.assign(new Error("البيع الآجل يتطلب اختيار عميل"), { status: 400 });
          const customer = await tx.customer.findUnique({ where: { id: customerId } });
          if (!customer) throw Object.assign(new Error("العميل غير موجود"), { status: 404 });
          const projected = decimal(customer.creditBalance || 0).add(total);
          if (decimal(customer.creditLimit || 0).greaterThan(0) && projected.greaterThan(customer.creditLimit)) {
            throw Object.assign(new Error(`تجاوز الحد الائتماني للعميل. الحد ${decimal(customer.creditLimit).toFixed(2)}`), { status: 422 });
          }
          paid = decimal(0);
          change = decimal(0);
          splitInput = [];
        } else {
          if (![...METHODS, "MIXED"].includes(paymentMethod) || paymentMethod === "MIXED") throw Object.assign(new Error("للدفع المختلط أرسل تفاصيل طرق الدفع"), { status: 400 });
          const rawPaid = decimal(money(req.body.amountPaid ?? total, "المبلغ المدفوع"));
          if (rawPaid.lessThan(total)) throw Object.assign(new Error("المبلغ المدفوع أقل من إجمالي الفاتورة"), { status: 400 });
          if (paymentMethod !== "CASH" && rawPaid.sub(total).abs().greaterThan(decimal("0.01"))) throw Object.assign(new Error("الدفع غير النقدي يجب أن يساوي إجمالي الفاتورة"), { status: 400 });
          change = paymentMethod === "CASH" && rawPaid.greaterThan(total) ? rawPaid.sub(total) : decimal(0);
          paid = rawPaid;
          const account = await resolvePaymentAccount(tx, branchId, paymentMethod, req.body.accountId);
          splitInput = [{ method: paymentMethod, amount: total, account, reference: req.body.paymentReference ? String(req.body.paymentReference).slice(0,150) : null }];
        }
      }

      const created = await tx.invoice.create({
        data: { invoiceNumber, clientOperationId, branchId, cashierId: req.user.id, customerId: customerId || null, subtotal, discountAmount: extraDiscount, taxRate: decimal(taxRateN), taxAmount, total, amountPaid: paid, changeGiven: change, paymentMethod, notes: notes ? String(notes).slice(0,1000) : null, items: { create: lineItems.map(({ stockBefore, lowStockQty, ...x }) => x) } },
        include: { items: true, customer: { select: { id: true, name: true } }, branch: { select: { id: true, name: true, code: true } } },
      });

      for (const item of lineItems) {
        const updated = await tx.inventory.updateMany({ where: { productId: item.productId, branchId, quantity: { gte: item.quantity } }, data: { quantity: { decrement: item.quantity } } });
        if (updated.count !== 1) throw Object.assign(new Error(`تغير مخزون "${item.productName}" أثناء البيع، أعد المحاولة`), { status: 409 });
        const after = item.stockBefore - item.quantity;
        await tx.stockMovement.create({ data: { branchId, productId: item.productId, userId: req.user.id, type: "SALE", quantity: -item.quantity, quantityBefore: item.stockBefore, quantityAfter: after, referenceType: "Invoice", referenceId: created.id, notes: invoiceNumber } });
        if (after <= item.lowStockQty) {
          await tx.notification.create({ data: { branchId, type: after === 0 ? "WARNING" : "INFO", title: after === 0 ? "نفاد مخزون" : "مخزون منخفض", message: `${item.productName} — المتبقي ${after}`, link: "/inventory" } });
        }
        if (item.imeiNumbers.length) {
          const changed = await tx.productIMEI.updateMany({ where: { imei: { in: item.imeiNumbers }, branchId, status: "IN_STOCK" }, data: { status: "SOLD", saleInvoiceId: created.id, soldAt: new Date() } });
          if (changed.count !== item.imeiNumbers.length) throw Object.assign(new Error("تغيرت حالة أحد أرقام IMEI أثناء البيع، أعد المحاولة"), { status: 409 });
        }
      }

      let cashPosted = decimal(0);
      for (const split of splitInput) {
        await tx.paymentSplit.create({ data: { invoiceId: created.id, accountId: split.account.id, method: split.method, amount: split.amount, reference: split.reference } });
        await postMovement(tx, { branchId, accountId: split.account.id, userId: req.user.id, type: "SALE", amount: split.amount, direction: "IN", referenceType: "Invoice", referenceId: created.id, description: `بيع ${invoiceNumber}` });
        if (split.account.type === "CASHBOX") cashPosted = cashPosted.add(split.amount);
      }
      if (cashPosted.greaterThan(0)) await tx.branch.update({ where: { id: branchId }, data: { cashboxBalance: { increment: cashPosted } } });
      if (customerId) {
        if (loyaltyPointsToRedeem > 0) {
          await tx.customer.update({ where: { id: customerId }, data: { loyaltyPoints: { decrement: loyaltyPointsToRedeem } } });
          await tx.loyaltyTransaction.create({ data: { customerId, userId: req.user.id, points: -loyaltyPointsToRedeem, type: "REDEEM", referenceType: "Invoice", referenceId: created.id, notes: invoiceNumber } });
        }
        const earnStep = Math.max(0.01, Number(branchSettings.loyaltyEarnPerAmount || 100));
        const pointsPerStep = Math.max(0, Number(branchSettings.loyaltyPointsPerStep || 1));
        const earnedPoints = Math.floor(Number(total) / earnStep) * pointsPerStep;
        await tx.customer.update({ where: { id: customerId }, data: { totalSpent: { increment: total }, ...(earnedPoints > 0 ? { loyaltyPoints: { increment: earnedPoints } } : {}) } });
        if (earnedPoints > 0) await tx.loyaltyTransaction.create({ data: { customerId, userId: req.user.id, points: earnedPoints, type: "SALE_EARN", referenceType: "Invoice", referenceId: created.id, notes: invoiceNumber } });
      }
      if (promotion) await tx.promotion.update({ where: { id: promotion.id }, data: { usedCount: { increment: 1 } } });
      if (paymentMethod === "CREDIT") {
        const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
        const rec = await tx.customerReceivable.create({ data: { customerId, branchId, invoiceId: created.id, originalAmount: total, remaining: total, dueDate, notes: notes ? String(notes).slice(0,1000) : null } });
        await tx.customer.update({ where: { id: customerId }, data: { creditBalance: { increment: total } } });
        const count = Math.max(0, Math.min(60, Number(req.body.installmentsCount || 0)));
        if (count > 0) {
          const firstDue = req.body.firstDueDate ? new Date(req.body.firstDueDate) : (dueDate || new Date());
          const each = total.div(count);
          let allocated = decimal(0);
          for (let i = 1; i <= count; i++) {
            const due = new Date(firstDue); due.setMonth(due.getMonth() + i - 1);
            const val = i === count ? total.sub(allocated) : each.toDecimalPlaces(2); allocated = allocated.add(val);
            await tx.installment.create({ data: { receivableId: rec.id, sequence: i, dueDate: due, amount: val } });
          }
        }
      }
      const full = await tx.invoice.findUnique({ where: { id: created.id }, include: { items: true, customer: { select: { id: true, name: true } }, branch: { select: { id: true, name: true, code: true } }, paymentSplits: { include: { account: { select: { id: true, name: true, type: true } } } } } });
      return { invoice: full, change };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 25000 });

    for (const item of result.invoice.items) {
      const updated = await prisma.inventory.findUnique({ where: { productId_branchId: { productId: item.productId, branchId } }, select: { quantity: true } });
      io.to(`branch:${branchId}`).emit("inventory:update", { productId: item.productId, branchId, quantity: updated?.quantity ?? 0 });
    }
    io.to(`branch:${branchId}`).emit("finance:update", { branchId });
    await audit(req.user, "SALE", "Invoice", result.invoice.id, { invoiceNumber: result.invoice.invoiceNumber, total: String(result.invoice.total), payments: result.invoice.paymentSplits.map((p) => ({ method: p.method, amount: String(p.amount), account: p.account.name })) }, branchId);
    res.status(201).json({ invoice: result.invoice, change: Number(result.change), message: "تمت عملية البيع بنجاح" });
  } catch (err) {
    console.error("[Checkout]", err);
    if (err.code === "P2002") return res.status(409).json({ error: "تعارض في رقم الفاتورة، أعد المحاولة" });
    res.status(err.status || 500).json({ error: err.status ? err.message : "فشل في إتمام عملية البيع" });
  }
});

export default router;
