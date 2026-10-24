import { Router } from "express";
import { prisma } from "../index.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { money, pageParams } from "../utils/security.js";
import { audit } from "../utils/audit.js";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res) => {
  try {
    const { search, categoryId, view } = req.query;
    const effectiveBranchId = req.branchId;
    const { page, limit, skip } = pageParams(req.query, 60, 100);
    const where = { isActive: true };
    const andFilters = [];
    if (search) {
      const term = String(search).trim();
      const productSearch = ["name", "sku", "barcode", "brand", "variantLabel"].map((field) => ({ [field]: { contains: term, mode: "insensitive" } }));
      if (view === "management") {
        andFilters.push({ OR: [...productSearch, { variants: { some: { isActive: true, OR: productSearch } } }] });
      } else {
        andFilters.push({ OR: productSearch });
      }
    }
    if (categoryId && categoryId !== "null" && categoryId !== "undefined") where.categoryId = categoryId;
    if (view === "management") {
      where.parentProductId = null;
    } else {
      // A parent is never a sellable SKU once it has variants, even if all variants are deactivated.
      andFilters.push({ OR: [{ parentProductId: { not: null } }, { variants: { none: {} } }] });
    }
    if (andFilters.length) where.AND = andFilters;
    const inventoryInclude = effectiveBranchId ? { where: { branchId: effectiveBranchId } } : true;
    const include = {
      category: { select: { id: true, name: true, icon: true } },
      inventory: inventoryInclude,
    };
    if (view === "management") {
      include.variants = { where: { isActive: true }, include: { inventory: inventoryInclude }, orderBy: { name: "asc" } };
    } else {
      include.parentProduct = { select: { id: true, name: true, imageUrl: true } };
    }
    const [products, total] = await prisma.$transaction([
      prisma.product.findMany({ where, include, skip, take: limit, orderBy: { name: "asc" } }),
      prisma.product.count({ where }),
    ]);
    const shaped = view === "management" ? products : products.map((p) => ({
      ...p,
      imageUrl: p.imageUrl || p.parentProduct?.imageUrl || null,
      displayName: p.parentProduct ? `${p.parentProduct.name} - ${p.variantLabel || p.name}` : p.name,
      name: p.parentProduct ? `${p.parentProduct.name} - ${p.variantLabel || p.name}` : p.name,
    }));
    res.json({ products: shaped, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { console.error("PRODUCT_LIST_ERROR", err); res.status(500).json({ error: "تعذر تحميل المنتجات" }); }
});


router.post("/bulk/import", authorize("SUPER_ADMIN", "BRANCH_MANAGER", "INVENTORY_MANAGER"), async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length || rows.length > 5000) return res.status(400).json({ error: "عدد الصفوف غير صالح (1-5000)" });
    const branchId = req.branchId;
    let created = 0, updated = 0, failed = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      try {
        const name = String(r.name || r.productName || "").trim();
        const sku = String(r.sku || "").trim().toUpperCase();
        if (!name || !sku) throw new Error("الاسم وSKU مطلوبان");
        let categoryId = r.categoryId || null;
        if (!categoryId && r.category) {
          const categoryName = String(r.category).trim();
          const slug = categoryName.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g,"-").replace(/^-|-$/g,"") || `cat-${Date.now()}-${i}`;
          const cat = await prisma.category.upsert({ where: { name: categoryName }, update: {}, create: { name: categoryName, slug: `${slug}-${Math.random().toString(36).slice(2,6)}` } });
          categoryId = cat.id;
        }
        const existing = await prisma.product.findUnique({ where: { sku } });
        const data = { name, sku, barcode: r.barcode ? String(r.barcode).trim() : null, brand: r.brand ? String(r.brand).trim() : null, categoryId, costPrice: money(r.costPrice || 0, "سعر التكلفة"), salePrice: money(r.salePrice || 0, "سعر البيع"), lowStockQty: Math.max(0, Number.parseInt(r.lowStockQty || 5,10)||0), hasIMEI: String(r.hasIMEI).toLowerCase() === "true" || r.hasIMEI === true };
        const product = existing ? await prisma.product.update({ where: { id: existing.id }, data }) : await prisma.product.create({ data });
        existing ? updated++ : created++;
        const qty = Math.max(0, Number.parseInt(r.quantity || 0,10)||0);
        if (branchId && qty > 0 && !product.hasIMEI) {
          const inv = await prisma.inventory.findUnique({ where: { productId_branchId: { productId: product.id, branchId } } });
          const before = inv?.quantity || 0;
          await prisma.inventory.upsert({ where: { productId_branchId: { productId: product.id, branchId } }, create: { productId: product.id, branchId, quantity: qty }, update: { quantity: qty } });
          if (before !== qty) await prisma.stockMovement.create({ data: { branchId, productId: product.id, userId: req.user.id, type: before === 0 ? "OPENING" : (qty > before ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT"), quantity: qty - before, quantityBefore: before, quantityAfter: qty, referenceType: "BulkImport", referenceId: product.id, notes: "استيراد CSV" } });
        }
      } catch (e) { failed++; if (errors.length < 50) errors.push({ row: i + 2, error: e.message }); }
    }
    await audit(req.user, "PRODUCT_BULK_IMPORT", "Product", null, { created, updated, failed }, branchId);
    res.json({ created, updated, failed, errors });
  } catch (err) { res.status(500).json({ error: "تعذر استيراد المنتجات" }); }
});

router.get("/:id", async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id }, include: { category: true, inventory: { include: { branch: { select: { id: true, name: true, code: true } } } }, variants: { orderBy: { name: "asc" }, include: { inventory: { include: { branch: { select: { id: true, name: true, code: true } } } }, imeiRecords: { where: { status: "IN_STOCK" }, orderBy: { receivedAt: "desc" } } } }, parentProduct: { select: { id: true, name: true, sku: true, imageUrl: true } }, imeiRecords: { where: { status: "IN_STOCK" }, orderBy: { receivedAt: "desc" } } } });
  if (!product) return res.status(404).json({ error: "المنتج غير موجود" });
  if (req.user.role !== "SUPER_ADMIN") {
    product.inventory = product.inventory.filter((x) => x.branchId === req.user.branchId);
    product.imeiRecords = product.imeiRecords.filter((x) => x.branchId === req.user.branchId);
    product.variants = product.variants.map((variant) => ({ ...variant, inventory: variant.inventory.filter((x) => x.branchId === req.user.branchId), imeiRecords: variant.imeiRecords.filter((x) => x.branchId === req.user.branchId) }));
  }
  res.json(product);
});

router.post("/", authorize("SUPER_ADMIN", "BRANCH_MANAGER", "INVENTORY_MANAGER"), async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const sku = String(req.body.sku || "").trim().toUpperCase();
    if (!name || !sku) return res.status(400).json({ error: "اسم المنتج وSKU مطلوبان" });
    const parentProductId = req.body.parentProductId ? String(req.body.parentProductId) : null;
    const variantLabel = req.body.variantLabel ? String(req.body.variantLabel).trim() : null;
    if (parentProductId) {
      const parent = await prisma.product.findUnique({ where: { id: parentProductId }, select: { id: true, parentProductId: true, isActive: true } });
      if (!parent || parent.parentProductId || !parent.isActive) return res.status(400).json({ error: "المنتج الأساسي غير صالح لإضافة متغير" });
      if (!variantLabel) return res.status(400).json({ error: "اسم/وصف المتغير مطلوب مثل اللون والسعة" });
    }
    const product = await prisma.product.create({ data: { name, sku, barcode: req.body.barcode ? String(req.body.barcode).trim() : null, description: req.body.description || null, categoryId: req.body.categoryId || null, brand: req.body.brand || null, costPrice: money(req.body.costPrice || 0, "سعر التكلفة"), salePrice: money(req.body.salePrice || 0, "سعر البيع"), hasIMEI: Boolean(req.body.hasIMEI), imageUrl: req.body.imageUrl || null, lowStockQty: Math.max(0, Number.parseInt(req.body.lowStockQty || 5, 10) || 0), parentProductId, variantLabel } });
    await audit(req.user, "CREATE", "Product", product.id, { name: product.name, sku: product.sku });
    res.status(201).json(product);
  } catch (err) { if (err.code === "P2002") return res.status(409).json({ error: "SKU أو الباركود موجود بالفعل" }); res.status(500).json({ error: "تعذر إنشاء المنتج" }); }
});

router.post("/:id/stock", authorize("SUPER_ADMIN", "BRANCH_MANAGER", "INVENTORY_MANAGER"), async (req, res) => {
  try {
    const productId = req.params.id;
    const delta = Number(req.body?.delta);
    const branchId = req.branchId || req.user.branchId;
    if (!branchId) return res.status(400).json({ error: "الفرع غير محدد" });
    if (!Number.isInteger(delta) || delta === 0) return res.status(400).json({ error: "أدخل كمية صحيحة غير صفرية" });
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true, parentProductId: true } });
    if (!product) return res.status(404).json({ error: "المنتج غير موجود" });
    const current = await prisma.inventory.findUnique({ where: { productId_branchId: { productId, branchId } } });
    const nextQuantity = Number(current?.quantity || 0) + delta;
    if (nextQuantity < 0) return res.status(400).json({ error: "لا يمكن أن يصبح المخزون أقل من صفر" });
    const inventory = await prisma.inventory.upsert({
      where: { productId_branchId: { productId, branchId } },
      create: { productId, branchId, quantity: nextQuantity },
      update: { quantity: nextQuantity }
    });
    await audit(req.user, "STOCK_ADJUSTMENT", "Inventory", inventory.id, { productId, productName: product.name, branchId, delta, quantityBefore: current?.quantity || 0, quantityAfter: nextQuantity });
    res.json({ productId, branchId, delta, quantity: inventory.quantity, inventory });
  } catch (err) {
    console.error("PRODUCT_STOCK_ADJUSTMENT_ERROR", err);
    res.status(500).json({ error: "تعذر تحديث المخزون" });
  }
});

router.put("/:id", authorize("SUPER_ADMIN", "BRANCH_MANAGER", "INVENTORY_MANAGER"), async (req, res) => {
  try {
    const data = { ...req.body };
    delete data.id; delete data.createdAt; delete data.updatedAt; delete data.inventory; delete data.imeiRecords; delete data.category; delete data.variants; delete data.parentProduct;
    if (data.costPrice !== undefined) data.costPrice = money(data.costPrice, "سعر التكلفة");
    if (data.salePrice !== undefined) data.salePrice = money(data.salePrice, "سعر البيع");
    if (data.lowStockQty !== undefined) data.lowStockQty = Math.max(0, Number.parseInt(data.lowStockQty, 10) || 0);
    if (data.sku) data.sku = String(data.sku).trim().toUpperCase();
    const product = await prisma.product.update({ where: { id: req.params.id }, data });
    await audit(req.user, "UPDATE", "Product", product.id, { name: product.name, sku: product.sku });
    res.json(product);
  } catch (err) { if (err.code === "P2002") return res.status(409).json({ error: "SKU أو الباركود موجود بالفعل" }); res.status(500).json({ error: "تعذر تحديث المنتج" }); }
});

router.delete("/:id", authorize("SUPER_ADMIN", "BRANCH_MANAGER"), async (req, res) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id }, include: { variants: { select: { id: true } } } });
    if (!product) return res.status(404).json({ error: "المنتج غير موجود" });
    const ids = [product.id, ...product.variants.map((variant) => variant.id)];
    await prisma.$transaction(async (tx) => {
      await tx.product.updateMany({ where: { id: { in: ids } }, data: { isActive: false } });
    });
    await audit(req.user, "DEACTIVATE", "Product", product.id, { name: product.name, deactivatedVariantCount: product.variants.length });
    res.json({ message: "تم تعطيل المنتج ومتغيراته", deactivatedVariantCount: product.variants.length });
  } catch (err) { console.error("PRODUCT_DEACTIVATE_ERROR", err); res.status(500).json({ error: "تعذر تعطيل المنتج" }); }
});

export default router;
