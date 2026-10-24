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
function addMonthsSafely(date, months) { const d = new Date(date); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + months); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return d; }

router.post("/checkout", async (req, res) => {
  const branchId = req.branchId;
  try {
    const { items, customerId, discountAmount = 0, taxRate = 0, notes } = req.body;
    const systemFeatureRow = await prisma.systemSetting.findUnique({ where: { id: "global" }, select: { features: true } });
    const systemFeatures = systemFeatureRow?.features || {};
    const english = String(req.headers["accept-language"] || "").toLowerCase().startsWith("en");
    const requestedRedeemPoints = Math.max(0, Number.parseInt(req.body.redeemPoints || 0, 10) || 0);
    const requestedCredit = req.body.paymentMethod === "CREDIT" || (Array.isArray(req.body.paymentSplits) && req.body.paymentSplits.some((split) => split?.method === "CREDIT"));
    if (systemFeatures.loyalty === false && requestedRedeemPoints > 0) return res.status(503).json({ error: english ? "The loyalty program is currently disabled by the system administrator." : "نظام الولاء معطل حاليًا بواسطة مسؤول النظام", code: "FEATURE_DISABLED", feature: "loyalty" });
    if (systemFeatures.installments === false && requestedCredit && Number(req.body.installmentsCount || 0) > 0) return res.status(503).json({ error: english ? "Installments are currently disabled by the system administrator." : "التقسيط معطل حاليًا بواسطة مسؤول النظام", code: "FEATURE_DISABLED", feature: "installments" });
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
    if (req.user.role === "CASHIER") {
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
        if (req.user.role === "CASHIER" && discountPctN > Number(req.user.maxDiscountPct || 0) && !req.body.approvalRequestId) throw Object.assign(new Error(`الخصم على "${product.name}" يتجاوز حدك المسموح (${Number(req.user.maxDiscountPct || 0)}%)`), { status: 403 });
        if (req.user.role !== "SUPER_ADMIN" && branchSettings.requireApprovalDiscountAbove != null && discountPctN > Number(branchSettings.requireApprovalDiscountAbove) && !req.body.approvalRequestId) throw Object.assign(new Error(`خصم الصنف "${product.name}" يتجاوز حد الموافقة (${Number(branchSettings.requireApprovalDiscountAbove)}%).`), { status: 403 });
        if (req.user.role === "CASHIER" && !unitPrice.equals(product.salePrice)) throw Object.assign(new Error(`لا تملك صلاحية تعديل سعر "${product.name}"`), { status: 403 });
        const discPct = decimal(discountPctN);
        const gross = unitPrice.mul(quantity);
        const lineTotal = gross.sub(gross.mul(discPct).div(100));
        subtotal = subtotal.add(lineTotal);
        lineItems.push({ productId: product.id, productName: product.name, sku: product.sku, quantity, unitPrice, costPrice: product.costPrice, discountPct: discPct, lineTotal, imeiNumbers, stockBefore: inv.quantity, lowStockQty: product.lowStockQty });
      }

      const itemDiscountTotal = lineItems.reduce((sum, item) => sum.add(item.unitPrice.mul(item.quantity).mul(item.discountPct).div(100)), decimal(0));
      const itemNeedsApproval = lineItems.some(item => (req.user.role === "CASHIER" && Number(item.discountPct) > Number(req.user.maxDiscountPct || 0)) || (req.user.role !== "SUPER_ADMIN" && branchSettings.requireApprovalDiscountAbove != null && Number(item.discountPct) > Number(branchSettings.requireApprovalDiscountAbove)));
      if (itemNeedsApproval) {
        const approvalId = String(req.body.approvalRequestId || "");
        if (!approvalId) throw Object.assign(new Error("يتطلب خصم صنف تجاوز حدك موافقة المدير. سيتم إرسال طلب الموافقة من شاشة البيع."), { status: 403 });
        const approval = await tx.approvalRequest.findFirst({ where: { id: approvalId, branchId, requestedById: req.user.id, entityType: "DISCOUNT", action: "APPROVE_DISCOUNT", status: "APPROVED", entityId: null } });
        const cartSignature = lineItems.map(x => `${x.productId}:${x.quantity}:${decimal(x.unitPrice).toFixed(2)}:${decimal(x.discountPct).toFixed(2)}`).sort().join("|");
        const approvedAmount = Number(approval?.payload?.discountAmount);
        const approvedSubtotal = Number(approval?.payload?.subtotal);
        if (!approval || Math.abs(approvedAmount - Number(itemDiscountTotal.add(decimal(extraDiscountN)))) > 0.009 || Math.abs(approvedSubtotal - Number(subtotal)) > 0.009 || approval.payload?.cartSignature !== cartSignature) {
          throw Object.assign(new Error("موافقة المدير غير موجودة أو لا تطابق السلة الحالية. أعد إرسال طلب الموافقة."), { status: 403 });
        }
        req.approvedDiscountRequestId = approval.id;
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
        if (promotion.maxTotal != null && subtotal.greaterThan(promotion.maxTotal)) throw Object.assign(new Error(`الفاتورة تتجاوز الحد الأقصى للعرض ${decimal(promotion.maxTotal).toFixed(2)}`), { status: 422 });
        const eligibleIds = new Set(promotion.products.map(x => x.productId));
        const eligibleItems = eligibleIds.size ? lineItems.filter(x => eligibleIds.has(x.productId)) : lineItems;
        const eligible = eligibleItems.reduce((sum,x)=>sum.add(x.lineTotal), decimal(0));
        const eligibleQuantity = eligibleItems.reduce((sum,x)=>sum+x.quantity,0);
        if (eligibleQuantity < Number(promotion.minQuantity || 1)) throw Object.assign(new Error(`هذا العرض يتطلب ${Number(promotion.minQuantity || 1)} قطعة على الأقل`), { status: 422 });
        if (eligible.lessThanOrEqualTo(0)) throw Object.assign(new Error("لا توجد منتجات مؤهلة لهذا العرض"), { status: 422 });
        promoDiscount = promotion.type === "PERCENT" ? eligible.mul(promotion.value).div(100) : decimal(promotion.value);
        if (promotion.maxDiscount != null && promoDiscount.greaterThan(promotion.maxDiscount)) promoDiscount = decimal(promotion.maxDiscount);
        if (promoDiscount.greaterThan(eligible)) promoDiscount = eligible;
      }
      const manualDiscount = decimal(extraDiscountN);
      const manualDiscountPct = subtotal.greaterThan(0) ? Number(manualDiscount.mul(100).div(subtotal)) : 0;
      const userDiscountLimit = Number(req.user.maxDiscountPct || 0);
      const branchDiscountLimit = branchSettings.requireApprovalDiscountAbove == null ? null : Number(branchSettings.requireApprovalDiscountAbove);
      const exceedsUserLimit = req.user.role === "CASHIER" && manualDiscountPct > userDiscountLimit;
      const exceedsBranchLimit = req.user.role !== "SUPER_ADMIN" && branchDiscountLimit !== null && manualDiscountPct > branchDiscountLimit;
      if (exceedsUserLimit || exceedsBranchLimit) {
        const approvalId=String(req.body.approvalRequestId||"");
        const limitLabel=exceedsUserLimit ? userDiscountLimit : branchDiscountLimit;
        if(!approvalId) throw Object.assign(new Error(`الخصم يتجاوز حد الموافقة (${limitLabel}%). اطلب اعتماد المدير أولاً`),{status:403});
        const approval=await tx.approvalRequest.findFirst({where:{id:approvalId,branchId,requestedById:req.user.id,entityType:"DISCOUNT",action:"APPROVE_DISCOUNT",status:"APPROVED",entityId:null}});
        if(!approval) throw Object.assign(new Error("طلب اعتماد الخصم غير معتمد أو مستخدم بالفعل"),{status:403});
        const approvedAmount=Number(approval.payload?.discountAmount);
        const approvedSubtotal=Number(approval.payload?.subtotal);
        const cartSignature=lineItems.map(x=>`${x.productId}:${x.quantity}:${decimal(x.unitPrice).toFixed(2)}:${decimal(x.discountPct).toFixed(2)}`).sort().join("|");
        if(Math.abs(approvedAmount-Number(manualDiscount.add(itemDiscountTotal)))>0.009||Math.abs(approvedSubtotal-Number(subtotal))>0.009||approval.payload?.cartSignature!==cartSignature)
          throw Object.assign(new Error("السلة أو مبلغ الخصم تغير بعد طلب الموافقة. اطلب موافقة جديدة"),{status:409});
        req.approvedDiscountRequestId=approval.id;
      }
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

      if(req.approvedDiscountRequestId){
        const consumed=await tx.approvalRequest.updateMany({where:{id:req.approvedDiscountRequestId,branchId,status:"APPROVED",entityId:null},data:{entityId:created.id}});
        if(consumed.count!==1) throw Object.assign(new Error("تم استخدام موافقة الخصم بالفعل. اطلب موافقة جديدة"),{status:409});
      }

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
        const earnedPoints = systemFeatures.loyalty === false ? 0 : Math.floor(Number(total) / earnStep) * pointsPerStep;
        await tx.customer.update({ where: { id: customerId }, data: { totalSpent: { increment: total }, ...(earnedPoints > 0 ? { loyaltyPoints: { increment: earnedPoints } } : {}) } });
        if (earnedPoints > 0) await tx.loyaltyTransaction.create({ data: { customerId, userId: req.user.id, points: earnedPoints, type: "SALE_EARN", referenceType: "Invoice", referenceId: created.id, notes: invoiceNumber } });
      }
      if (promotion) {
        const usageUpdate = await tx.promotion.updateMany({
          where: { id: promotion.id, ...(promotion.usageLimit ? { usedCount: { lt: promotion.usageLimit } } : {}) },
          data: { usedCount: { increment: 1 } }
        });
        if (usageUpdate.count !== 1) throw Object.assign(new Error("تم الوصول للحد الأقصى لاستخدام العرض"), { status: 422 });
      }
      if (paymentMethod === "CREDIT") {
        const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
        if (dueDate && Number.isNaN(dueDate.getTime())) throw Object.assign(new Error("تاريخ الاستحقاق غير صالح"), { status: 400 });
        const rawCount = Number(req.body.installmentsCount || 0);
        if (!Number.isInteger(rawCount) || rawCount < 0 || rawCount > 60) throw Object.assign(new Error("عدد الأقساط يجب أن يكون عددًا صحيحًا من 0 إلى 60"), { status: 400 });
        const count = rawCount;
        const requestedFirstDue = req.body.firstDueDate ? new Date(req.body.firstDueDate) : null;
        if (requestedFirstDue && Number.isNaN(requestedFirstDue.getTime())) throw Object.assign(new Error("تاريخ أول قسط غير صالح"), { status: 400 });
        const rec = await tx.customerReceivable.create({ data: { customerId, branchId, invoiceId: created.id, originalAmount: total, remaining: total, dueDate, notes: notes ? String(notes).slice(0,1000) : null } });
        await tx.customer.update({ where: { id: customerId }, data: { creditBalance: { increment: total } } });
        if (count > 0) {
          const firstDue = requestedFirstDue || dueDate || new Date();
          const each = total.div(count);
          let allocated = decimal(0);
          for (let i = 1; i <= count; i++) {
            const due = addMonthsSafely(firstDue, i - 1);
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
