import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useStore, api } from "../store/index.js";
import { Plus, Search, Edit2, X, Check, Package, RefreshCw, AlertTriangle, ChevronDown, ImagePlus, LayoutGrid, List as ListIcon, ExternalLink, UploadCloud, Rows3, EyeOff, Trash2, ChevronRight, Layers3, Printer, FileText, TrendingUp, Wallet, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { useDialog } from "../components/InteractionProvider.jsx";

// ── SHARED MODAL ────────────────────────────────────────────
function Modal({ title, onClose, children, footer, size = "lg" }) {
  const widthClass = size === "xl" ? "max-w-4xl" : size === "md" ? "max-w-md" : "max-w-lg";
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-white rounded-2xl w-full ${widthClass} shadow-2xl max-h-[90vh] flex flex-col`} onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800">{title}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="p-5 border-t shrink-0 flex gap-2">{footer}</div>}
      </div>
    </div>
  );
}

function Btn({ onClick, children, variant = "primary", disabled, className = "" }) {
  const base = "px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2";
  const variants = { primary: "bg-indigo-600 text-white hover:bg-indigo-700", secondary: "border border-slate-200 text-slate-700 hover:bg-slate-50", danger: "bg-red-600 text-white hover:bg-red-700", success: "bg-green-600 text-white hover:bg-green-700" };
  return <button onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>{children}</button>;
}

function Field({ label, children }) {
  return <div className="space-y-1"><label className="text-sm font-medium text-slate-700">{label}</label>{children}</div>;
}

function Input({ ...props }) {
  return <input {...props} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />;
}

function Select({ children, ...props }) {
  return <select {...props} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">{children}</select>;
}

function Badge({ children, color = "slate" }) {
  const colors = { slate: "bg-slate-100 text-slate-700", green: "bg-green-100 text-green-700", red: "bg-red-100 text-red-700", yellow: "bg-yellow-100 text-yellow-700", blue: "bg-blue-100 text-blue-700", orange: "bg-orange-100 text-orange-700", purple: "bg-purple-100 text-purple-700" };
  return <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${colors[color]}`}>{children}</span>;
}

async function prepareProductImage(file) {
  if (!file || !file.type?.startsWith("image/")) throw new Error("اختر ملف صورة صالحًا");
  if (file.size > 8 * 1024 * 1024) throw new Error("حجم الصورة الأصلية يجب ألا يتجاوز 8 ميجابايت");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("تعذر قراءة الصورة")); });
    const scale = Math.min(1, 360 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.72, 0.62, 0.52, 0.42, 0.34]) {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", quality));
      if (!blob) continue;
      if (blob.size <= 28 * 1024) {
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("تعذر تجهيز الصورة"));
          reader.readAsDataURL(blob);
        });
      }
    }
    throw new Error("الصورة لا تزال كبيرة بعد الضغط. اختر صورة أبسط أو استخدم رابط صورة مباشر.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// ══════════════════════════════════════════════════════════════
// INVENTORY
// ══════════════════════════════════════════════════════════════
export function Inventory() {
  const navigate = useNavigate();
  const { confirm } = useDialog();
  const language = useStore((state) => state.language);
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;
  const { categories, fetchCategories, activeBranch } = useStore();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null); // null | 'add' | 'edit' | 'adjust' | 'imei'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({});
  const [adjustForm, setAdjustForm] = useState({ type: "ADD", quantity: 1, reason: "" });
  const [imeiList, setImeiList] = useState([{ imei: "", color: "", storage: "" }]);
  const [stockFilter, setStockFilter] = useState("all");
  const [viewMode, setViewMode] = useState("grid");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [imageUploading, setImageUploading] = useState(false);
  const [expandedProducts, setExpandedProducts] = useState({});

  const quantityFor = (product) => product.variants?.length ? product.variants.reduce((sum, variant) => sum + Number(variant.inventory?.[0]?.quantity ?? 0), 0) : Number(product.inventory?.[0]?.quantity ?? 0);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/products?view=management&limit=100&branchId=${activeBranch?.id || ""}&search=${encodeURIComponent(search)}`);
      setProducts(data.products);
    } catch { toast.error("فشل تحميل المنتجات"); }
    setLoading(false);
  };

  useEffect(() => { load(); fetchCategories(); }, [search, activeBranch?.id]);
  const inventorySummary = products.reduce((summary, product) => {
    const quantity = quantityFor(product);
    if (product.isActive !== false && quantity <= Number(product.lowStockQty ?? 5)) {
      summary.lowStock += 1;
      if (quantity === 0) summary.outOfStock += 1;
    }
    return summary;
  }, { lowStock: 0, outOfStock: 0 });
  const visibleProducts = products.filter((product) => {
    const quantity = quantityFor(product);
    const matchesStock = stockFilter === "all" || (product.isActive !== false && (stockFilter === "out" ? quantity === 0 : quantity <= Number(product.lowStockQty ?? 5)));
    const matchesCategory = categoryFilter === "all" || product.categoryId === categoryFilter;
    return matchesStock && matchesCategory;
  });
  const reorderSuggestions = products
    .filter((product) => product.isActive !== false && !product.hasIMEI)
    .map((product) => {
      const quantity = Number(quantityFor(product));
      const minimum = Math.max(0, Number(product.lowStockQty ?? 5));
      const target = Math.max(minimum + 1, minimum * 2, 1);
      return { ...product, currentQuantity: quantity, minimumQuantity: minimum, suggestedQuantity: Math.max(0, target - quantity) };
    })
    .filter((product) => product.currentQuantity <= product.minimumQuantity && product.suggestedQuantity > 0)
    .sort((a, b) => a.currentQuantity - b.currentQuantity || a.name.localeCompare(b.name));

  const openAdd = () => { setSelected(null); setForm({ salePrice: 0, costPrice: 0, lowStockQty: 5, hasIMEI: false, isActive: true, parentProductId: null }); setModal("add"); };
  const openEdit = (p) => { setSelected(p); setForm({ ...p }); setModal("edit"); };
  const openAddVariant = (parent) => { setSelected(parent); setForm({ name: parent.name, brand: parent.brand || "", categoryId: parent.categoryId || "", salePrice: Number(parent.salePrice || 0), costPrice: Number(parent.costPrice || 0), lowStockQty: 5, hasIMEI: parent.hasIMEI || false, isActive: true, parentProductId: parent.id, variantLabel: "", imageUrl: parent.imageUrl || "" }); setModal("variantAdd"); };
  const toggleVariants = (id) => setExpandedProducts(current => ({ ...current, [id]: !current[id] }));
  const handleDeleteProduct = async (product) => {
    const variantCount = product.variants?.length || 0;
    const message = t("هل تريد تعطيل المنتج؟ ستظل الفواتير والحركات التاريخية محفوظة.", "Deactivate this product? Historical invoices and stock movements will be preserved.") + (variantCount ? " " + variantCount + t(" متغير سيتم تعطيله أيضًا.", " variant(s) will also be deactivated.") : "");
    const ok = await confirm(message, { title: t("تأكيد حذف المنتج", "Confirm product deletion"), danger: true, confirmLabel: t("حذف المنتج", "Delete product") });
    if (!ok) return;
    try { await api.delete(`/products/${product.id}`); toast.success(t("تم حذف/تعطيل المنتج", "Product deactivated")); await load(); }
    catch (err) { toast.error(err.response?.data?.error || t("تعذر حذف المنتج", "Could not delete product")); }
  };
  const openAdjust = (p) => { setSelected(p); setAdjustForm({ type: "ADD", quantity: 1, reason: "" }); setModal("adjust"); };
  const openIMEI = (p) => { setSelected(p); setImeiList([{ imei: "", color: "", storage: "" }]); setModal("imei"); };

  const handleImageUpload = async (file) => {
    if (!file) return;
    setImageUploading(true);
    try {
      const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
      const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
      let imageUrl;
      if (cloudName && uploadPreset) {
        const compressed = await prepareProductImage(file);
        const blob = await (await fetch(compressed)).blob();
        const body = new FormData();
        body.append("file", blob, "product.webp");
        body.append("upload_preset", uploadPreset);
        body.append("folder", "erp-pos/products");
        const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body });
        const result = await response.json();
        if (!response.ok || !result.secure_url) throw new Error(result.error?.message || "فشل رفع الصورة إلى خدمة الصور");
        imageUrl = result.secure_url;
      } else {
        imageUrl = await prepareProductImage(file);
      }
      setForm(current => ({ ...current, imageUrl }));
      toast.success(cloudName && uploadPreset ? "تم رفع الصورة" : "تم تجهيز الصورة المضغوطة وحفظها مع بيانات المنتج");
    } catch (err) {
      toast.error(err.message || "تعذر رفع الصورة");
    } finally {
      setImageUploading(false);
    }
  };

  const handleSave = async () => {
    if (imageUploading) return toast.error(t("انتظر حتى تنتهي معالجة الصورة", "Please wait for image processing to finish"));
    try {
      if (modal === "add" || modal === "variantAdd") {
        const payload = { ...form };
        if (modal === "variantAdd") {
          if (!String(payload.variantLabel || "").trim()) return toast.error(t("أدخل اللون أو مواصفات المتغير", "Enter a color or variant description"));
          payload.name = selected.name;
        }
        await api.post("/products", payload);
      } else await api.put(`/products/${selected.id}`, form);
      toast.success(t("تم الحفظ", "Saved successfully"));
      setModal(null);
      await load();
    } catch (err) { toast.error(err.response?.data?.error || t("فشل الحفظ", "Save failed")); }
  };

  const handleAdjust = async () => {
    try {
      await api.post("/inventory/adjust", { productId: selected.id, branchId: activeBranch?.id, ...adjustForm });
      toast.success("تم تعديل المخزون");
      setModal(null);
      load();
    } catch (err) { toast.error(err.response?.data?.error || "فشل التعديل"); }
  };

  const handleAddIMEI = async () => {
    const valid = imeiList.filter((i) => i.imei.trim());
    if (!valid.length) return toast.error("أدخل رقم IMEI واحد على الأقل");
    try {
      await api.post("/inventory/imei", { productId: selected.id, branchId: activeBranch?.id, imeiList: valid });
      toast.success("تم إضافة IMEI");
      setModal(null);
      load();
    } catch (err) { toast.error(err.response?.data?.error || "فشل إضافة IMEI"); }
  };

  return (
    <div className="erp-pro-page erp-inventory-page p-6" dir={en ? "ltr" : "rtl"}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="text-2xl font-bold text-slate-800">{t("إدارة المخزون", "Inventory Management")}</h2>
        <Btn onClick={openAdd}><Plus className="w-4 h-4" /> {t("منتج جديد", "New product")}</Btn>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <button onClick={() => setStockFilter("all")} className={`rounded-2xl border p-4 text-right transition-colors ${stockFilter === "all" ? "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-100" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
          <p className="text-sm text-slate-500">{t("المنتجات المعروضة", "Products loaded")}</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-800">{products.length}</p>
        </button>
        <button onClick={() => setStockFilter("low")} className={`rounded-2xl border p-4 text-right transition-colors ${stockFilter === "low" ? "border-amber-300 bg-amber-50 ring-1 ring-amber-100" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
          <p className="flex items-center gap-2 text-sm text-amber-700"><AlertTriangle className="h-4 w-4" />{t("مخزون منخفض", "Low stock")}</p>
          <p className="mt-1 text-2xl font-extrabold text-amber-700">{inventorySummary.lowStock}</p>
          <p className="mt-1 text-xs text-slate-500">{t("اضغط لعرض المنتجات التي تحتاج مراجعة", "Select to filter items needing review")}</p>
        </button>
        <button onClick={() => setStockFilter("out")} className={`rounded-2xl border p-4 text-right transition-colors ${stockFilter === "out" ? "border-rose-300 bg-rose-100 ring-1 ring-rose-100" : "border-rose-200 bg-rose-50 hover:bg-rose-100"}`}>
          <p className="text-sm text-rose-700">{t("نفد المخزون", "Out of stock")}</p>
          <p className="mt-1 text-2xl font-extrabold text-rose-700">{inventorySummary.outOfStock}</p>
        </button>
      </div>

      {reorderSuggestions.length > 0 && (
        <section className="mb-5 overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 bg-amber-50 p-4">
            <div>
              <h3 className="font-bold text-amber-900">{t("اقتراحات إعادة الطلب", "Reorder suggestions")}</h3>
              <p className="mt-1 text-xs text-amber-800">{t("اقتراح إرشادي: الكمية المستهدفة ضعف حد المخزون على الأقل، وليست أمر شراء تلقائيًا.", "Planning aid only: target stock is at least twice the low-stock threshold; this does not create a purchase order.")}</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-amber-800">{reorderSuggestions.length} {t("منتج", "products")}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 text-right text-xs text-slate-500">
                <th className="px-4 py-3">{t("المنتج", "Product")}</th>
                <th className="px-4 py-3">{t("المتاح", "On hand")}</th>
                <th className="px-4 py-3">{t("حد التنبيه", "Low-stock limit")}</th>
                <th className="px-4 py-3">{t("الكمية المقترحة", "Suggested quantity")}</th>
                <th className="px-4 py-3">{t("إجراء", "Action")}</th>
              </tr></thead>
              <tbody>
                {reorderSuggestions.slice(0, 20).map((product) => (
                  <tr key={product.id} className="border-t border-slate-100">
                    <td className="px-4 py-3"><div className="font-semibold text-slate-800">{product.name}</div><div className="text-xs text-slate-400">{product.sku}</div></td>
                    <td className={`px-4 py-3 font-bold ${product.currentQuantity === 0 ? "text-rose-600" : "text-amber-700"}`}>{product.currentQuantity}</td>
                    <td className="px-4 py-3">{product.minimumQuantity}</td>
                    <td className="px-4 py-3 font-bold text-indigo-700">{product.suggestedQuantity}</td>
                    <td className="px-4 py-3"><Btn variant="secondary" onClick={() => openEdit(product)}>{t("تعديل المنتج", "Edit product")}</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {reorderSuggestions.length > 20 && <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">{t("يتم عرض أول 20 منتجًا حسب أولوية النقص.", "Showing the first 20 products by stock urgency.")}</p>}
        </section>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="p-4 border-b flex flex-col xl:flex-row gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("ابحث بالاسم أو SKU أو الباركود أو العلامة التجارية...", "Search name, SKU, barcode or brand...")} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pr-9 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white min-w-[170px]">
            <option value="all">{t("كل التصنيفات", "All categories")}</option>
            {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 p-1" role="group" aria-label={t("طريقة عرض المنتجات", "Product view mode")}>
            <button onClick={() => setViewMode("grid")} title={t("بطاقات كبيرة بالصورة", "Large image cards")} aria-pressed={viewMode === "grid"} className={`rounded-lg p-2 ${viewMode === "grid" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}><LayoutGrid className="h-4 w-4" /></button>
            <button onClick={() => setViewMode("compact")} title={t("قائمة بصورة صغيرة على الجانب", "Compact rows with side thumbnail")} aria-pressed={viewMode === "compact"} className={`rounded-lg p-2 ${viewMode === "compact" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}><Rows3 className="h-4 w-4" /></button>
            <button onClick={() => setViewMode("list")} title={t("جدول كامل", "Full table")} aria-pressed={viewMode === "list"} className={`rounded-lg p-2 ${viewMode === "list" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}><ListIcon className="h-4 w-4" /></button>
            <button onClick={() => setViewMode("plain")} title={t("قائمة بدون صور", "List without images")} aria-pressed={viewMode === "plain"} className={`rounded-lg p-2 ${viewMode === "plain" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}><EyeOff className="h-4 w-4" /></button>
          </div>
          <button onClick={load} title={t("تحديث", "Refresh")} className="p-2.5 border border-slate-200 rounded-xl hover:bg-slate-50"><RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? "animate-spin" : ""}`} /></button>
        </div>

        {viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 p-4">
            {visibleProducts.map(p => {
              const qty = quantityFor(p);
              const lowStock = qty <= Number(p.lowStockQty ?? 5);
              const variantPrices = (p.variants || []).map(variant => Number(variant.salePrice || 0));
              const priceLabel = variantPrices.length
                ? (Math.min(...variantPrices) === Math.max(...variantPrices)
                  ? Math.min(...variantPrices).toLocaleString(en ? "en-US" : "ar-EG", { maximumFractionDigits: 2 })
                  : Math.min(...variantPrices).toLocaleString(en ? "en-US" : "ar-EG", { maximumFractionDigits: 2 }) + " – " + Math.max(...variantPrices).toLocaleString(en ? "en-US" : "ar-EG", { maximumFractionDigits: 2 }))
                : Number(p.salePrice || 0).toLocaleString(en ? "en-US" : "ar-EG", { maximumFractionDigits: 2 });
              return <article key={p.id} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg">
                <div className="relative flex h-44 items-center justify-center bg-slate-50 p-3">
                  {p.imageUrl ? <img src={p.imageUrl} alt={p.name} loading="lazy" className="h-full w-full object-contain" onError={e => { e.currentTarget.style.display = "none"; }} /> : <div className="flex flex-col items-center gap-2 text-slate-300"><Package className="h-12 w-12" /><span className="text-xs">{t("لا توجد صورة", "No image")}</span></div>}
                  <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold ${p.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{p.isActive ? t("فعال", "Active") : t("معطل", "Inactive")}</span>
                  {qty === 0 && <span className="absolute left-3 top-3 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">{t("نفد المخزون", "Out of stock")}</span>}
                </div>
                <div className="space-y-3 p-4">
                  <div className="min-h-[56px]"><h3 className="line-clamp-2 font-bold text-slate-800">{p.name}</h3><p className="mt-1 text-xs text-slate-400">{p.brand || t("بدون علامة تجارية", "No brand")} · {p.sku}</p></div>
                  <div className="flex items-end justify-between gap-2"><div><p className="text-xs text-slate-500">{t("سعر البيع", "Sale price")}</p><p className="text-xl font-extrabold text-indigo-700">{priceLabel} {t("ج.م", "EGP")}</p></div><div className="text-left"><p className="text-xs text-slate-500">{t("المتاح", "In stock")}</p><p className={`font-bold ${qty === 0 ? "text-rose-600" : lowStock ? "text-amber-600" : "text-emerald-600"}`}>{qty}</p></div></div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3"><span className="max-w-[55%] truncate text-xs text-slate-500">{p.category?.name || t("بدون تصنيف", "Uncategorized")}</span><div className="flex gap-1"><button onClick={() => openEdit(p)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title={t("تعديل المنتج", "Edit product")}><Edit2 className="h-4 w-4" /></button>{!p.variants?.length && <button onClick={() => openAdjust(p)} className="rounded-lg border border-slate-200 p-2 text-indigo-600 hover:bg-indigo-50" title={t("تعديل المخزون", "Adjust stock")}><RefreshCw className="h-4 w-4" /></button>}{p.hasIMEI && <button onClick={() => openIMEI(p)} className="rounded-lg border border-slate-200 p-2 text-blue-600 hover:bg-blue-50" title="IMEI">IMEI</button>}</div></div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => navigate(`/products/${p.id}`)} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"><ExternalLink className="h-3.5 w-3.5" />{t("عرض التفاصيل", "View details")}</button>
                    <button onClick={() => openAddVariant(p)} className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-2 text-xs font-semibold text-indigo-700"><Plus className="h-3.5 w-3.5" />{t("إضافة متغير", "Add variant")}</button>
                    {p.variants?.length > 0 && <button onClick={() => toggleVariants(p.id)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs">{t("المتغيرات", "Variants")} ({p.variants.length})</button>}
                    <button onClick={() => handleDeleteProduct(p)} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold text-rose-600"><Trash2 className="h-3.5 w-3.5" />{t("حذف", "Delete")}</button>
                  </div>
                  <>{expandedProducts[p.id] && p.variants?.length > 0 && <section className="mt-3 overflow-hidden rounded-2xl border border-indigo-100 bg-slate-50/80">
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 bg-white px-4 py-3">
    <div><h4 className="text-sm font-extrabold text-slate-800">{t("متغيرات المنتج", "Product variants")}</h4><p className="mt-1 text-xs text-slate-500">{t("كل متغير له باركود وسعر ومخزون مستقل", "Each variant has its own barcode, price and stock")}</p></div>
    <div className="flex items-center gap-2"><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">{p.variants.length} {t("متغير", "variants")}</span><button onClick={() => openAddVariant(p)} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"><Plus className="h-3.5 w-3.5" />{t("إضافة متغير", "Add variant")}</button></div>
  </div>
  <div className="space-y-2 p-3">
    {p.variants.map(variant => {
      const variantQty = Number(variant.inventory?.[0]?.quantity ?? 0);
      const variantLow = variantQty <= Number(variant.lowStockQty ?? 5);
      return <div key={variant.id} className="grid grid-cols-1 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50">{variant.imageUrl ? <img src={variant.imageUrl} alt={variant.variantLabel || variant.name} className="h-full w-full object-contain p-1" /> : <Package className="h-6 w-6 text-slate-300" />}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-extrabold text-slate-800">{variant.variantLabel || variant.name}</p><span className={variant.isActive === false ? "rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500" : "rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"}>{variant.isActive === false ? t("معطل", "Inactive") : t("فعال", "Active")}</span>{variant.hasIMEI && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">IMEI</span>}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500"><span>SKU: <b className="font-mono text-slate-700">{variant.sku || "—"}</b></span><span>{t("الباركود", "Barcode")}: <b className="font-mono text-slate-700">{variant.barcode || "—"}</b></span></div>
            <div className="mt-2 flex flex-wrap items-center gap-3"><span className="text-sm font-extrabold text-indigo-700">{Number(variant.salePrice || 0).toLocaleString()} {t("ج.م", "EGP")}</span><span className="text-xs text-slate-500">{t("التكلفة", "Cost")}: {Number(variant.costPrice || 0).toLocaleString()}</span><span className={variantQty === 0 ? "rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700" : variantLow ? "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700" : "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"}>{t("المخزون", "Stock")}: {variantQty}</span><span className="text-[11px] text-slate-400">{t("حد التنبيه", "Alert at")} {Number(variant.lowStockQty ?? 5)}</span></div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-2 sm:border-0 sm:pt-0">
          <button onClick={() => openAdjust(variant)} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-100 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50" title={t("تعديل المخزون", "Adjust stock")}><RefreshCw className="h-3.5 w-3.5" /><span>{t("المخزون", "Stock")}</span></button>
          <button onClick={() => openEdit(variant)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title={t("تعديل", "Edit")}><Edit2 className="h-4 w-4" /></button>
          <button onClick={() => handleDeleteProduct(variant)} className="rounded-lg border border-rose-100 p-2 text-rose-600 hover:bg-rose-50" title={t("تعطيل المتغير", "Deactivate variant")}><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>;
    })}
  </div>
</section>}</>
                </div>
              </article>;
            })}
            {visibleProducts.length === 0 && !loading && <div className="col-span-full py-16 text-center text-slate-400"><Package className="mx-auto mb-3 h-10 w-10" /><p>{t("لا توجد منتجات مطابقة للفلاتر", "No products match these filters")}</p></div>}
          </div>
        ) : viewMode === "compact" ? (
          <div className="divide-y divide-slate-100 p-2 sm:p-3">
            {visibleProducts.map(p => {
              const qty = quantityFor(p);
              const lowStock = qty <= Number(p.lowStockQty ?? 5);
              return <article key={p.id} className="flex items-center gap-3 rounded-xl p-2 sm:gap-4 sm:p-3 hover:bg-slate-50">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white sm:h-20 sm:w-20">
                  {p.imageUrl ? <img src={p.imageUrl} alt={p.name} loading="lazy" className="h-full w-full object-contain" onError={e => { e.currentTarget.style.display = "none"; }} /> : <Package className="h-7 w-7 text-slate-300" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-bold text-slate-800">{p.name}</h3><Badge color={p.isActive ? "green" : "red"}>{p.isActive ? t("فعال", "Active") : t("معطل", "Inactive")}</Badge>{qty === 0 && <Badge color="red">{t("نافد", "Out")}</Badge>}</div>
                  <p className="mt-1 truncate text-xs text-slate-500">{p.brand || t("بدون علامة تجارية", "No brand")} · {p.sku} · {p.category?.name || t("بدون تصنيف", "Uncategorized")}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1"><span className="font-bold text-indigo-700">{Number(p.salePrice || 0).toLocaleString(en ? "en-US" : "ar-EG", { maximumFractionDigits: 2 })} {t("ج.م", "EGP")}</span><span className={`text-sm font-semibold ${qty === 0 ? "text-rose-600" : lowStock ? "text-amber-600" : "text-emerald-600"}`}>{t("المخزون:", "Stock:")} {qty}</span>{p.hasIMEI && <span className="text-xs text-blue-600">IMEI</span>}</div>
                </div>
                <div className="flex shrink-0 flex-col gap-1 sm:flex-row"><button onClick={() => navigate(`/products/${p.id}`)} className="rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-indigo-700 hover:bg-indigo-100" title={t("عرض التفاصيل", "View details")}><ExternalLink className="h-4 w-4" /></button><button onClick={() => openEdit(p)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-white" title={t("تعديل المنتج", "Edit product")}><Edit2 className="h-4 w-4" /></button><button onClick={() => openAdjust(p)} className="rounded-lg border border-slate-200 p-2 text-indigo-600 hover:bg-indigo-50" title={t("تعديل المخزون", "Adjust stock")}><RefreshCw className="h-4 w-4" /></button>{p.hasIMEI && <button onClick={() => openIMEI(p)} className="rounded-lg border border-slate-200 p-2 text-blue-600" title="IMEI">IMEI</button>}</div>
              </article>;
            })}
            {visibleProducts.length === 0 && !loading && <div className="py-14 text-center text-slate-400"><Package className="mx-auto mb-3 h-10 w-10" /><p>{t("لا توجد منتجات مطابقة للفلاتر", "No products match these filters")}</p></div>}
          </div>
        ) : viewMode === "plain" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-slate-50 text-right text-xs text-slate-500"><th className="px-4 py-3">{t("اسم المنتج", "Product name")}</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3">{t("التصنيف", "Category")}</th><th className="px-4 py-3">{t("سعر البيع", "Sale price")}</th><th className="px-4 py-3">{t("المخزون", "Stock")}</th><th className="px-4 py-3">{t("الحالة", "Status")}</th><th className="px-4 py-3">{t("إجراءات", "Actions")}</th></tr></thead>
              <tbody>{visibleProducts.map(p => { const qty = quantityFor(p); return <tr key={p.id} className="border-b hover:bg-slate-50"><td className="px-4 py-3 font-semibold text-slate-800">{p.name}</td><td className="px-4 py-3 font-mono text-slate-500">{p.sku}</td><td className="px-4 py-3 text-slate-600">{p.category?.name || "—"}</td><td className="px-4 py-3 font-semibold text-indigo-700">{Number(p.salePrice || 0).toLocaleString(en ? "en-US" : "ar-EG", { maximumFractionDigits: 2 })} {t("ج.م", "EGP")}</td><td className={`px-4 py-3 font-bold ${qty === 0 ? "text-rose-600" : qty <= Number(p.lowStockQty ?? 5) ? "text-amber-600" : "text-emerald-600"}`}>{qty}</td><td className="px-4 py-3"><Badge color={p.isActive ? "green" : "red"}>{p.isActive ? t("فعال", "Active") : t("معطل", "Inactive")}</Badge></td><td className="px-4 py-3"><div className="flex gap-1"><button onClick={() => navigate(`/products/${p.id}`)} className="rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-50" title={t("عرض التفاصيل", "View details")}><ExternalLink className="h-4 w-4" /></button><button onClick={() => openEdit(p)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title={t("تعديل", "Edit")}><Edit2 className="h-4 w-4" /></button><button onClick={() => openAdjust(p)} className="rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-50" title={t("تعديل الكمية", "Adjust stock")}><RefreshCw className="h-4 w-4" /></button></div></td></tr>; })}{visibleProducts.length === 0 && !loading && <tr><td colSpan={7} className="py-12 text-center text-slate-400">{t("لا توجد منتجات", "No products found")}</td></tr>}</tbody>
            </table>
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-right text-slate-500 text-xs">
                <th className="px-4 py-3 font-semibold">{t("المنتج", "Product")}</th>
                <th className="px-4 py-3 font-semibold">SKU</th>
                <th className="px-4 py-3 font-semibold">{t("التصنيف", "Category")}</th>
                <th className="px-4 py-3 font-semibold">{t("سعر البيع", "Sale price")}</th>
                <th className="px-4 py-3 font-semibold">{t("الكمية", "Quantity")}</th>
                <th className="px-4 py-3 font-semibold">IMEI</th>
                <th className="px-4 py-3 font-semibold">{t("الحالة", "Status")}</th>
                <th className="px-4 py-3 font-semibold">{t("إجراءات", "Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((p) => {
                const qty = quantityFor(p);
                const lowStock = qty <= p.lowStockQty;
                return (
                  <tr key={p.id} className="border-b hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-[220px]">
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-center">
                          {p.imageUrl ? <img src={p.imageUrl} alt={p.name} loading="lazy" className="h-full w-full object-contain" onError={e => { e.currentTarget.style.display = "none"; }} /> : <Package className="h-6 w-6 text-slate-300" />}
                        </div>
                        <div><p className="font-semibold text-slate-800">{p.name}</p>{p.brand && <p className="text-xs text-slate-400">{p.brand}</p>}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600">{p.sku}</td>
                    <td className="px-4 py-3 text-slate-600">{p.category?.name || "—"}</td>
                    <td className="px-4 py-3 font-semibold text-indigo-600">{parseFloat(p.salePrice).toLocaleString()} ج</td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${qty === 0 ? "text-red-600" : lowStock ? "text-amber-600" : "text-green-600"}`}>{qty}</span>
                      {lowStock && qty > 0 && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 inline mr-1" />}
                    </td>
                    <td className="px-4 py-3">{p.hasIMEI ? <Badge color="blue">IMEI</Badge> : <span className="text-slate-400 text-xs">—</span>}</td>
                    <td className="px-4 py-3"><Badge color={p.isActive ? "green" : "red"}>{p.isActive ? "فعال" : "معطل"}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(p)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500" title="تعديل"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => openAdjust(p)} className="p-1.5 hover:bg-indigo-50 rounded-lg text-indigo-500 text-xs font-medium px-2">{t("تعديل كمية", "Adjust quantity")}</button>
                        {p.hasIMEI && <button onClick={() => openIMEI(p)} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-500 text-xs font-medium px-2">+ IMEI</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {products.length === 0 && !loading && (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400">{t("لا توجد منتجات", "No products found")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {(modal === "add" || modal === "edit" || modal === "variantAdd") && (
        <Modal size={modal === "variantAdd" ? "xl" : "lg"} title={modal === "add" ? t("إضافة منتج أساسي", "Add parent product") : modal === "variantAdd" ? t("إضافة متغير للمنتج", "Add product variant") : t("تعديل المنتج", "Edit product")} onClose={() => setModal(null)} footer={<><Btn variant="secondary" onClick={() => setModal(null)}>{t("إلغاء", "Cancel")}</Btn><Btn onClick={handleSave}>{t("حفظ", "Save")}</Btn></>}>
          <div className="space-y-4">
            {modal === "variantAdd" && <div className="flex items-center gap-3 rounded-2xl border border-indigo-100 bg-gradient-to-l from-indigo-50 to-white p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700"><Layers3 className="h-6 w-6" /></div>
              <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-indigo-600">{t("المنتج الأساسي", "Parent product")}</p><p className="truncate text-base font-extrabold text-slate-900">{selected?.name || form.name}</p><p className="mt-1 text-xs text-slate-500">{t("أدخل مواصفات هذا المتغير فقط؛ السعر والباركود والمخزون سيتم تتبعها بشكل مستقل.", "Enter this variant's details; price, barcode and stock are tracked independently.")}</p></div>
              <span className="hidden rounded-full bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 sm:inline-flex">{selected?.variants?.length || 0} {t("متغير حالي", "existing variants")}</span>
            </div>}
            <Field label="اسم المنتج *"><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="اسم المنتج" /></Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {modal === "variantAdd" ? <div className="space-y-1"><div className="flex items-center justify-between gap-2"><label className="text-sm font-medium text-slate-700">SKU * <span className="text-xs font-normal text-slate-400">{t("كود فريد لكل نسخة","Unique per variant")}</span></label><button type="button" onClick={() => { const base = String(selected?.sku || "ITEM").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 18) || "ITEM"; const spec = String(form.variantLabel || "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 12); setForm(current => ({ ...current, sku: base + "-V" + (spec ? "-" + spec : "") + "-" + Date.now().toString().slice(-4) })); }} className="text-xs font-bold text-indigo-700 hover:text-indigo-900">{t("توليد كود تلقائي","Generate SKU")}</button></div><Input value={form.sku || ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="PARENT-VARIANT-001" /><p className="text-xs text-slate-500">{t("يجب أن يكون الكود مختلفًا عن المنتج وكل النسخ الأخرى.","Must be different from the parent and every other variant.")}</p></div> : <Field label="SKU *"><Input value={form.sku || ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="SKU-001" /></Field>}
              <Field label="باركود"><Input value={form.barcode || ""} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="1234567890" /></Field>
            </div>
            {modal === "variantAdd" && <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4">
              <div className="mb-3 flex items-center gap-2"><div className="rounded-lg bg-violet-100 p-2 text-violet-700"><Layers3 className="h-4 w-4" /></div><div><h4 className="text-sm font-extrabold text-violet-950">{t("مواصفات المتغير", "Variant specification")}</h4><p className="text-xs text-violet-700">{t("اكتب وصفًا واضحًا يظهر للكاشير عند البيع", "Use a clear label cashiers will see at checkout")}</p></div></div>
              <Field label={t("اللون / السعة / المواصفات *", "Color / storage / specification *")}><Input value={form.variantLabel || ""} onChange={e => setForm({ ...form, variantLabel: e.target.value })} placeholder={t("مثال: تيتانيوم طبيعي · 256GB", "e.g. Natural Titanium · 256GB")} /></Field>
              <div className="mt-3 flex flex-wrap gap-2">{["أسود","أبيض","أزرق","أخضر","128GB","256GB","512GB"].map(value => <button key={value} type="button" onClick={() => setForm(current => ({ ...current, variantLabel: current.variantLabel ? current.variantLabel + " · " + value : value }))} className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-800 hover:border-violet-400 hover:bg-violet-100">{value}</button>)}</div>
              <p className="mt-3 text-xs leading-5 text-violet-700">{t("استخدم الاختصارات ثم عدّل النص. كل نسخة لها SKU وسعر وتكلفة وصورة وحد مخزون مستقل.", "Use a quick option then edit the label. Each variant has its own SKU, price, cost, image and low-stock threshold.")}</p>
            </div>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="سعر البيع"><Input type="number" value={form.salePrice || ""} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} /></Field>
              <Field label="سعر التكلفة"><Input type="number" value={form.costPrice || ""} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="التصنيف">
                <Select value={form.categoryId || ""} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">{t("بدون تصنيف", "Uncategorized")}</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="العلامة التجارية"><Input value={form.brand || ""} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
            </div>
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3"><div><h4 className="font-semibold text-slate-800">{t("صورة المنتج", "Product image")}</h4><p className="mt-1 text-xs text-slate-500">{t("ارفع صورة من جهازك أو الصق رابط صورة مباشر", "Upload an image or paste a direct image URL")}</p></div>{form.imageUrl && <button type="button" onClick={() => setForm({ ...form, imageUrl: "" })} className="text-xs font-medium text-rose-600 hover:underline">{t("إزالة الصورة", "Remove image")}</button>}</div>
              <div className="flex flex-col sm:flex-row items-start gap-4">
                <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">{form.imageUrl ? <img src={form.imageUrl} alt="معاينة صورة المنتج" className="h-full w-full object-contain" onError={e => { e.currentTarget.style.display = "none"; e.currentTarget.parentElement?.querySelector("[data-image-fallback]")?.classList.remove("hidden"); }} /> : null}<div data-image-fallback className={"text-center text-slate-300 " + (form.imageUrl ? "hidden" : "")}><ImagePlus className="mx-auto h-8 w-8" /><span className="mt-1 block text-xs">{t("ارفع صورة أو الصق رابطًا صالحًا", "Upload an image or paste a valid URL")}</span></div></div>
                <div className="min-w-0 flex-1 space-y-3">
                  <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 ${imageUploading ? "pointer-events-none opacity-50" : ""}`}><UploadCloud className="h-4 w-4" />{imageUploading ? t("جاري تجهيز الصورة...", "Preparing image...") : t("اختيار صورة من الجهاز", "Choose image") }<input type="file" accept="image/*" className="hidden" disabled={imageUploading} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; handleImageUpload(file); }} /></label>
                  <Field label={t("رابط الصورة المباشر", "Direct image URL")}><Input value={form.imageUrl || ""} onChange={e => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://example.com/product.jpg" /></Field>
                  <p className="text-xs leading-5 text-slate-500">{t("يتم ضغط الصورة تلقائيًا لتقليل الحجم. في حالة عدم إعداد خدمة صور خارجية، تُحفظ نسخة صغيرة مع بيانات المنتج.", "Images are compressed automatically. Without an external image service, a small compressed copy is stored with the product record.")}</p>
                </div>
              </div>
            </div>
            <Field label={t("حد المخزون المنخفض", "Low stock threshold")}><Input type="number" min="0" value={form.lowStockQty ?? 5} onChange={(e) => setForm({ ...form, lowStockQty: Math.max(0, parseInt(e.target.value, 10) || 0) })} /></Field>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.hasIMEI || false} onChange={(e) => setForm({ ...form, hasIMEI: e.target.checked })} className="w-4 h-4 rounded accent-indigo-600" />
                <span className="text-sm font-medium text-slate-700">{t("يتطلب رقم IMEI", "IMEI required")}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isActive !== false} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4 rounded accent-indigo-600" />
                <span className="text-sm font-medium text-slate-700">{t("فعال", "Active")}</span>
              </label>
            </div>
          </div>
        </Modal>
      )}

      {/* Adjust Modal */}
      {modal === "adjust" && (
        <Modal title={`تعديل مخزون: ${selected?.name}`} onClose={() => setModal(null)} footer={<><Btn variant="secondary" onClick={() => setModal(null)}>{t("إلغاء", "Cancel")}</Btn><Btn onClick={handleAdjust}>{t("تنفيذ", "Apply")}</Btn></>}>
          <div className="space-y-3">
            <Field label="نوع التعديل">
              <Select value={adjustForm.type} onChange={(e) => setAdjustForm({ ...adjustForm, type: e.target.value })}>
                <option value="ADD">{t("إضافة للمخزون", "Add to stock")}</option>
                <option value="REMOVE">{t("خصم من المخزون", "Remove from stock")}</option>
                <option value="SET">{t("تحديد كمية محددة", "Set exact quantity")}</option>
              </Select>
            </Field>
            <Field label="الكمية"><Input type="number" value={adjustForm.quantity} onChange={(e) => setAdjustForm({ ...adjustForm, quantity: parseInt(e.target.value) })} min={1} /></Field>
            <Field label="السبب"><Input value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} placeholder="سبب التعديل..." /></Field>
          </div>
        </Modal>
      )}

      {/* IMEI Modal */}
      {modal === "imei" && (
        <Modal title={`إضافة IMEI: ${selected?.name}`} onClose={() => setModal(null)} footer={<><Btn variant="secondary" onClick={() => setModal(null)}>{t("إلغاء", "Cancel")}</Btn><Btn onClick={handleAddIMEI}>{t("حفظ", "Save")}</Btn></>}>
          <div className="space-y-3">
            {imeiList.map((item, i) => (
              <div key={i} className="grid grid-cols-3 gap-2 items-center">
                <Input value={item.imei} onChange={(e) => { const l = [...imeiList]; l[i].imei = e.target.value; setImeiList(l); }} placeholder="رقم IMEI *" />
                <Input value={item.color} onChange={(e) => { const l = [...imeiList]; l[i].color = e.target.value; setImeiList(l); }} placeholder="اللون" />
                <Input value={item.storage} onChange={(e) => { const l = [...imeiList]; l[i].storage = e.target.value; setImeiList(l); }} placeholder="السعة" />
              </div>
            ))}
            <button onClick={() => setImeiList([...imeiList, { imei: "", color: "", storage: "" }])} className="text-indigo-600 text-sm hover:underline flex items-center gap-1"><Plus className="w-4 h-4" /> إضافة سطر</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SALES
// ══════════════════════════════════════════════════════════════
export function Sales() {
  const { confirm } = useDialog();
  const language = useStore((state) => state.language);
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;
  const { activeBranch } = useStore();
  const [invoices, setInvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [viewMode, setViewMode] = useState("table");

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: 20,
        ...(activeBranch?.id && { branchId: activeBranch.id }),
        ...(from && { from }),
        ...(to && { to }),
      });
      const { data } = await api.get(`/invoices?${params}`);
      setInvoices(data.invoices);
      setTotal(data.total);
    } catch {
      toast.error("فشل التحميل");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [page, from, to, activeBranch?.id]);

  const PM_AR = {
    CASH: "كاش",
    CARD: "كارت",
    BANK_TRANSFER: "تحويل بنكي",
    VODAFONE_CASH: "فودافون كاش",
    INSTAPAY: "إنستاباي",
    MIXED: "مختلط",
  };

  const filteredInvoices = invoices.filter((inv) => { const q=search.trim().toLowerCase(); const okSearch=!q||[inv.invoiceNumber,inv.customer?.name,inv.cashier?.name,inv.paymentMethod].some(v=>String(v||"").toLowerCase().includes(q)); return okSearch&&(paymentFilter==="ALL"||inv.paymentMethod===paymentFilter); });
  const pageRevenue=invoices.reduce((s,i)=>s+Number(i.total||0),0);
  const pagePaid=invoices.reduce((s,i)=>s+Number(i.amountPaid||0),0);
  const pageOutstanding=invoices.reduce((s,i)=>s+Math.max(0,Number(i.total||0)-Number(i.amountPaid||0)),0);
  const currency=(v)=>Number(v||0).toLocaleString(en?"en-US":"ar-EG",{minimumFractionDigits:2,maximumFractionDigits:2});
  const paymentLabel=(m)=>PM_AR[m]||m||t("غير محدد","Unspecified");

  const handleDelete = async (invoice) => {
    const ok = await confirm(
      t(`هل أنت متأكد من حذف الفاتورة ${invoice.invoiceNumber}؟\n\nسيتم إرجاع المخزون وعكس التأثير المالي المرتبط بالفاتورة. لا يمكن التراجع عن هذه العملية.`,`Delete invoice ${invoice.invoiceNumber}?\n\nInventory will be returned and the related financial effects reversed. This action cannot be undone.`),
      { title: t("تأكيد حذف الفاتورة", "Confirm invoice deletion"), danger: true, confirmLabel: t("حذف الفاتورة", "Delete invoice") }
    );
    if (!ok) return;

    try {
      await api.delete(`/invoices/${invoice.id}`);
      toast.success("تم حذف الفاتورة وإرجاع تأثيرها بنجاح");
      if (selected?.id === invoice.id) setSelected(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || "تعذر حذف الفاتورة");
    }
  };

  const handlePrint = async (invoiceId) => {
    try {
      const { data: inv } = await api.get(`/invoices/${invoiceId}`);
      const printWindow = window.open("", "_blank", "width=500,height=750");

      if (!printWindow) {
        toast.error("تعذر فتح نافذة الطباعة");
        return;
      }

      const esc = (value) =>
        String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");

      const money = (value) => Number(value || 0).toFixed(2);

      const paymentText =
        inv.paymentSplits?.length > 0
          ? inv.paymentSplits
              .map((p) => `${esc(p.account?.name || PM_AR[p.method] || p.method)}: ${money(p.amount)} ج`)
              .join(" + ")
          : PM_AR[inv.paymentMethod] || inv.paymentMethod || "-";

      const itemsHtml = (inv.items || [])
        .map(
          (item) => `
            <div class="item">
              <div class="item-name">${esc(item.productName)}</div>
              <div class="row">
                <span>${item.quantity} × ${money(item.unitPrice)}</span>
                <strong>${money(item.lineTotal)} ج</strong>
              </div>
              ${
                item.imeiNumbers?.length
                  ? `<div class="small">IMEI: ${item.imeiNumbers.map(esc).join(", ")}</div>`
                  : ""
              }
            </div>
            <div class="sep"></div>
          `
        )
        .join("");

      printWindow.document.write(`
        <!doctype html>
        <html lang="${en ? "en" : "ar"}" dir="${en ? "ltr" : "rtl"}">
          <head>
            <meta charset="UTF-8" />
            <title>${esc(inv.invoiceNumber)}</title>
            <style>
              @page { size: 80mm auto; margin: 3mm; }
              * { box-sizing: border-box; }
              body { font-family: Arial, Tahoma, sans-serif; width: 72mm; margin: 0 auto; color: #172033; background: #fff; font-size: 11px; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .center { text-align: center; }
              .bold { font-weight: 800; }
              .muted { color: #64748b; }
              .brand { background: #111827; color: #fff; padding: 13px 8px 11px; border-radius: 8px 8px 0 0; text-align: center; }
              .brand h2 { margin: 0 0 3px; font-size: 18px; letter-spacing: .2px; color: #fff; }
              .brand p { margin: 2px 0; color: #e2e8f0; font-size: 10px; }
              .invoice-label { margin: 10px 0 4px; font-size: 13px; font-weight: 800; }
              .invoice-no { display: inline-block; padding: 4px 9px; border: 1px solid #cbd5e1; border-radius: 5px; font-size: 11px; font-weight: 800; }
              .meta { margin: 9px 0; padding: 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
              .meta p { margin: 3px 0; }
              .section-title { margin: 10px 0 5px; font-size: 10px; font-weight: 800; color: #475569; }
              .items-head { display: flex; justify-content: space-between; gap: 5px; padding: 5px 0; border-bottom: 1px solid #cbd5e1; font-size: 9px; color: #64748b; font-weight: 700; }
              .item { margin: 0; padding: 7px 0; border-bottom: 1px dashed #cbd5e1; break-inside: avoid; }
              .item-name { font-weight: 800; margin-bottom: 3px; overflow-wrap: anywhere; }
              .row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
              .row span:last-child, .row strong { text-align: end; }
              .small { margin-top: 3px; font-size: 9px; color: #64748b; word-break: break-all; }
              .totals { margin-top: 9px; padding: 8px; border: 1px solid #e2e8f0; border-radius: 7px; }
              .totals .row { margin: 4px 0; }
              .grand-total { margin: 7px -2px 5px; padding: 8px 6px; border-radius: 5px; background: #eef2ff; color: #312e81; font-size: 14px; font-weight: 900; }
              .paid { color: #047857; }
              .due { color: #b45309; font-weight: 800; }
              .sep { border-top: 1px dashed #cbd5e1; margin: 8px 0; }
              .footer { margin-top: 11px; padding: 9px 5px; border-top: 1px solid #e2e8f0; text-align: center; color: #475569; }
              .footer .thanks { font-size: 12px; font-weight: 800; color: #111827; }
              .footer p { margin: 3px 0; }
              p { margin: 3px 0; }
              @media screen { body { margin: 12px auto; padding-bottom: 12px; } }
              @media print { body { width: 72mm; } .brand, .grand-total { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
            </style>
          </head>
          <body>
            <div class="brand">
              <h2>${esc(inv.branch?.name || "ERP POS")}</h2>
              ${inv.branch?.address ? `<p>${esc(inv.branch.address)}</p>` : ""}
              ${inv.branch?.phone ? `<p>${esc(inv.branch.phone)}</p>` : ""}
              ${inv.branch?.taxNumber ? `<p>الرقم الضريبي: ${esc(inv.branch.taxNumber)}</p>` : ""}
            </div>
            <div class="center">
              <p class="invoice-label">${esc(t("فاتورة مبيعات", "SALES INVOICE"))}</p>
              <span class="invoice-no">${esc(inv.invoiceNumber)}</span>
              <p class="muted">${new Date(inv.createdAt).toLocaleString(en ? "en-US" : "ar-EG")}</p>
            </div>
            <div class="meta">
              <p><span class="muted">${esc(t("العميل", "Customer"))}:</span> <strong>${esc(inv.customer?.name || t("عميل نقدي", "Walk-in"))}</strong></p>
              ${inv.customer?.phone ? `<p><span class="muted">${esc(t("الهاتف", "Phone"))}:</span> ${esc(inv.customer.phone)}</p>` : ""}
              <p><span class="muted">${esc(t("الكاشير", "Cashier"))}:</span> ${esc(inv.cashier?.name || "-")}</p>
            </div>
            <p class="section-title">${esc(t("تفاصيل الأصناف", "ITEM DETAILS"))}</p>
            <div class="items-head"><span>${esc(t("الصنف / الكمية × السعر", "ITEM / QTY × PRICE"))}</span><span>${esc(t("الإجمالي", "TOTAL"))}</span></div>
            ${itemsHtml || `<p class="center muted">${esc(t("لا توجد أصناف", "No items"))}</p>`}
            <div class="totals">
              <div class="row"><span>${esc(t("المجموع الفرعي", "Subtotal"))}</span><span>${money(inv.subtotal)} ج</span></div>
              ${Number(inv.discountAmount) > 0 ? `<div class="row"><span>${esc(t("الخصم", "Discount"))}</span><span>−${money(inv.discountAmount)} ج</span></div>` : ""}
              ${Number(inv.taxAmount) > 0 ? `<div class="row"><span>${esc(t("الضريبة", "Tax"))}</span><span>${money(inv.taxAmount)} ج</span></div>` : ""}
              <div class="row grand-total"><span>${esc(t("الإجمالي النهائي", "GRAND TOTAL"))}</span><span>${money(inv.total)} ج</span></div>
              <div class="row paid"><span>${esc(t("المدفوع", "Paid"))}</span><strong>${money(inv.amountPaid)} ج</strong></div>
              ${Math.max(0, Number(inv.total || 0) - Number(inv.amountPaid || 0)) > 0.009 ? `<div class="row due"><span>${esc(t("المتبقي", "Balance due"))}</span><strong>${money(Math.max(0, Number(inv.total || 0) - Number(inv.amountPaid || 0)))} ج</strong></div>` : ""}
              ${Number(inv.changeGiven) > 0 ? `<div class="row"><span>${esc(t("الباقي للعميل", "Change"))}</span><span>${money(inv.changeGiven)} ج</span></div>` : ""}
            </div>
            <div class="meta">
              <p><span class="muted">${esc(t("طريقة الدفع", "Payment method"))}:</span> <strong>${paymentText}</strong></p>
              ${inv.notes ? `<p><span class="muted">${esc(t("ملاحظات", "Notes"))}:</span> ${esc(inv.notes)}</p>` : ""}
            </div>
            <div class="footer">
              <p class="thanks">${esc(t("شكراً لتعاملكم معنا", "Thank you for your business"))}</p>
              <p>${esc(t("نتمنى لكم يوماً سعيداً", "We appreciate your business"))}</p>
              <p class="muted">${esc(inv.invoiceNumber)}</p>
            </div>
            <script>
              window.onload = function () {
                setTimeout(function () {
                  window.focus();
                  window.print();
                }, 250);
              };
            </script>
          </body>
        </html>
      `);

      printWindow.document.close();
    } catch (err) {
      toast.error(err.response?.data?.error || "تعذر طباعة الفاتورة");
    }
  };

  return (
<div className="min-h-full bg-slate-50/70 p-4 sm:p-6 lg:p-8" dir={en?"ltr":"rtl"}><div className="mx-auto max-w-[1600px] space-y-6">
<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-indigo-600"><span className="h-2 w-2 rounded-full bg-indigo-600"/>{t("المبيعات","SALES")}</div><h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{t("سجل المبيعات","Sales history")}</h1></div><div className="flex flex-wrap gap-2"><button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-bold shadow-sm disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/>{t("تحديث","Refresh")}</button><button onClick={()=>window.print()} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white"><Printer className="h-4 w-4"/>{t("طباعة التقرير","Print report")}</button></div></header>
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
<div className="rounded-2xl bg-slate-950 p-5 text-white shadow-lg"><p className="text-sm text-slate-300">{t("عدد الفواتير","Invoices")}</p><p className="mt-3 text-3xl font-black">{total.toLocaleString()}</p></div>
<div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm font-semibold text-slate-500">{t("إجمالي المبيعات بالصفحة","Sales on page")}</p><p className="mt-3 text-2xl font-black">{currency(pageRevenue)} <span className="text-sm text-slate-400">{t("ج.م","EGP")}</span></p><TrendingUp className="mt-2 h-5 w-5 text-indigo-600"/></div>
<div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm font-semibold text-slate-500">{t("المبالغ المحصلة","Collected")}</p><p className="mt-3 text-2xl font-black text-emerald-700">{currency(pagePaid)} <span className="text-sm text-slate-400">{t("ج.م","EGP")}</span></p><Wallet className="mt-2 h-5 w-5 text-emerald-600"/></div>
<div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm font-semibold text-slate-500">{t("المتبقي للتحصيل","Outstanding")}</p><p className="mt-3 text-2xl font-black text-amber-700">{currency(pageOutstanding)} <span className="text-sm text-slate-400">{t("ج.م","EGP")}</span></p><Clock className="mt-2 h-5 w-5 text-amber-600"/></div></div>
<section className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="border-b p-4 sm:p-5"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
<label><span className="mb-1 block text-xs font-bold text-slate-500">{t("بحث","Search")}</span><div className="flex items-center gap-2 rounded-xl border bg-slate-50 px-3"><Search className="h-4 w-4 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("رقم الفاتورة أو العميل أو الكاشير","Invoice, customer or cashier")} className="w-full bg-transparent py-3 text-sm outline-none"/></div></label>
<label><span className="mb-1 block text-xs font-bold text-slate-500">{t("من تاريخ","From")}</span><input type="date" value={from} onChange={e=>{setPage(1);setFrom(e.target.value)}} className="w-full rounded-xl border bg-slate-50 px-3 py-3 text-sm"/></label>
<label><span className="mb-1 block text-xs font-bold text-slate-500">{t("إلى تاريخ","To")}</span><input type="date" value={to} onChange={e=>{setPage(1);setTo(e.target.value)}} className="w-full rounded-xl border bg-slate-50 px-3 py-3 text-sm"/></label>
<label><span className="mb-1 block text-xs font-bold text-slate-500">{t("طريقة الدفع","Payment method")}</span><select value={paymentFilter} onChange={e=>setPaymentFilter(e.target.value)} className="w-full rounded-xl border bg-slate-50 px-3 py-3 text-sm"><option value="ALL">{t("كل طرق الدفع","All methods")}</option>{Object.entries(PM_AR).map(([k,v])=><option key={k} value={k}>{en?({CASH:"Cash",CARD:"Card",BANK_TRANSFER:"Bank transfer",VODAFONE_CASH:"Vodafone Cash",INSTAPAY:"InstaPay",MIXED:"Mixed"}[k]):v}</option>)}</select></label></div>
<div className="mt-4 flex items-center justify-between"><div className="flex rounded-xl border bg-slate-50 p-1"><button onClick={()=>setViewMode("table")} className={`rounded-lg px-3 py-2 text-xs font-bold ${viewMode==="table"?"bg-white text-indigo-700 shadow":"text-slate-500"}`}><Rows3 className="me-1 inline h-4 w-4"/>{t("جدول","Table")}</button><button onClick={()=>setViewMode("cards")} className={`rounded-lg px-3 py-2 text-xs font-bold ${viewMode==="cards"?"bg-white text-indigo-700 shadow":"text-slate-500"}`}><LayoutGrid className="me-1 inline h-4 w-4"/>{t("بطاقات","Cards")}</button></div><span className="text-xs text-slate-400">{filteredInvoices.length} / {invoices.length}</span></div></div>
{loading?<div className="flex min-h-56 items-center justify-center gap-3 text-slate-500"><span className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600"/>{t("جاري التحميل…","Loading…")}</div>:filteredInvoices.length===0?<div className="flex min-h-56 flex-col items-center justify-center"><Search className="mb-3 h-8 w-8 text-slate-300"/><p className="font-bold">{t("لا توجد نتائج","No results")}</p><button onClick={()=>{setSearch("");setPaymentFilter("ALL");setFrom("");setTo("");setPage(1)}} className="mt-3 rounded-xl border px-4 py-2 text-sm">{t("مسح الفلاتر","Clear filters")}</button></div>
:viewMode==="table"?<div className="overflow-x-auto"><table className="w-full min-w-[900px] text-start text-sm"><thead><tr className="border-b bg-slate-50 text-xs text-slate-500">{[t("الفاتورة","Invoice"),t("العميل","Customer"),t("الكاشير","Cashier"),t("الدفع","Payment"),t("الإجمالي","Total"),t("الحالة","Status"),t("التاريخ","Date"),t("إجراءات","Actions")].map(x=><th key={x} className="px-4 py-4 font-bold">{x}</th>)}</tr></thead><tbody>{filteredInvoices.map(inv=>{const due=Math.max(0,Number(inv.total||0)-Number(inv.amountPaid||0));const paid=due<=0.009;return <tr key={inv.id} className="border-b hover:bg-indigo-50/30"><td className="px-4 py-4"><b className="font-mono text-indigo-700">{inv.invoiceNumber}</b><div className="text-xs text-slate-400">{inv.items?.length||0} {t("صنف","items")}</div></td><td className="px-4 py-4"><b>{inv.customer?.name||t("عميل نقدي","Walk-in")}</b><div className="text-xs text-slate-400">{inv.customer?.phone||"—"}</div></td><td className="px-4 py-4">{inv.cashier?.name||"—"}</td><td className="px-4 py-4">{paymentLabel(inv.paymentMethod)}</td><td className="px-4 py-4 font-black">{currency(inv.total)} {t("ج.م","EGP")}{due>0.009&&<div className="text-xs text-amber-700">{t("متبقي","Due")}: {currency(due)}</div>}</td><td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-xs font-bold ${paid?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700"}`}>{paid?t("مدفوعة","Paid"):t("غير مكتملة","Partially paid")}</span></td><td className="px-4 py-4 text-xs text-slate-500">{new Date(inv.createdAt).toLocaleString(en?"en-US":"ar-EG")}</td><td className="px-4 py-4"><div className="flex flex-wrap gap-1"><button onClick={()=>setSelected(inv)} className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700">{t("عرض","View")}</button><button onClick={()=>handlePrint(inv.id)} className="rounded-lg border px-3 py-2 text-xs font-bold"><Printer className="me-1 inline h-3.5 w-3.5"/>{t("طباعة","Print")}</button><button onClick={()=>handleDelete(inv)} className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{t("حذف","Delete")}</button></div></td></tr>})}</tbody></table></div>
:<div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 2xl:grid-cols-3">{filteredInvoices.map(inv=>{const due=Math.max(0,Number(inv.total||0)-Number(inv.amountPaid||0));return <article key={inv.id} className="rounded-2xl border p-5 hover:shadow-lg"><div className="flex justify-between gap-3"><div><p className="font-mono font-black text-indigo-700">{inv.invoiceNumber}</p><h3 className="font-black">{inv.customer?.name||t("عميل نقدي","Walk-in")}</h3><p className="text-xs text-slate-400">{new Date(inv.createdAt).toLocaleString(en?"en-US":"ar-EG")}</p></div><span className="text-xs font-bold">{due<=0.009?t("مدفوعة","Paid"):t("متبقي","Due")}</span></div><div className="my-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{t("الإجمالي","Total")}</p><b>{currency(inv.total)}</b></div><div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-700">{t("المدفوع","Paid")}</p><b>{currency(inv.amountPaid)}</b></div></div><div className="flex justify-between"><span className="text-xs">{paymentLabel(inv.paymentMethod)}</span><button onClick={()=>setSelected(inv)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white">{t("التفاصيل","Details")}</button></div></article>})}</div>}
<div className="flex flex-wrap items-center justify-between gap-3 border-t bg-slate-50 p-4"><p className="text-xs text-slate-500">{t("عرض","Showing")} {invoices.length?((page-1)*20+1):0}–{Math.min(page*20,total)} {t("من","of")} {total}</p><div className="flex items-center gap-2"><button disabled={page===1||loading} onClick={()=>setPage(p=>Math.max(1,p-1))} className="rounded-xl border bg-white px-4 py-2 text-sm disabled:opacity-40">{t("السابق","Previous")}</button><b className="rounded-lg bg-slate-900 px-4 py-2 text-white">{page}</b><button disabled={page*20>=total||loading} onClick={()=>setPage(p=>p+1)} className="rounded-xl border bg-white px-4 py-2 text-sm disabled:opacity-40">{t("التالي","Next")}</button></div></div></section>
{selected&&<Modal size="xl" title={`${t("فاتورة","Invoice")}: ${selected.invoiceNumber}`} onClose={()=>setSelected(null)} footer={<><Btn variant="secondary" onClick={()=>setSelected(null)}>{t("إغلاق","Close")}</Btn><Btn onClick={()=>handlePrint(selected.id)}>{t("طباعة","Print")}</Btn><Btn variant="danger" onClick={()=>handleDelete(selected)}>{t("حذف","Delete")}</Btn></>}><InvoiceDetail id={selected.id}/></Modal>}</div></div>
  );
}

function InvoiceDetail({ id }) {
  const language = useStore((state) => state.language);
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;
  const [inv, setInv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setInv(null);
    const timer = setTimeout(() => controller.abort(), 15000);
    api.get(`/invoices/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(({ data }) => {
        if (!active) return;
        const invoice = data?.invoice || data?.data || data;
        if (!invoice || !invoice.id) throw new Error("استجابة تفاصيل الفاتورة غير مكتملة");
        setInv(invoice);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.name === "CanceledError" || err.name === "AbortError"
          ? "استغرق تحميل الفاتورة وقتًا أطول من اللازم. تحقق من الاتصال ثم أعد المحاولة."
          : err.response?.data?.error || err.message || "تعذر تحميل تفاصيل الفاتورة. تحقق من صلاحياتك والاتصال ثم أعد المحاولة.");
      })
      .finally(() => {
        clearTimeout(timer);
        if (active) setLoading(false);
      });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [id, attempt]);

  const money = (value) => Number(value ?? 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const retry = () => setAttempt((value) => value + 1);

  if (loading) {
    return <div className="flex min-h-56 flex-col items-center justify-center gap-3 py-12 text-slate-500"><div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" /><p className="font-semibold">جاري تحميل تفاصيل الفاتورة...</p><p className="text-xs">لن يتوقف العرض دون إظهار رسالة عند تعذر الاتصال</p></div>;
  }

  if (error || !inv) {
    return <div className="space-y-3 rounded-2xl border border-red-100 bg-red-50 p-6 text-center"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-700"><AlertTriangle className="h-5 w-5"/></div><p className="font-semibold text-red-700">{error || "تعذر تحميل الفاتورة"}</p><div className="flex justify-center gap-2"><button onClick={retry} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">إعادة المحاولة</button></div></div>;
  }

  const items = Array.isArray(inv.items) ? inv.items : [];
  const paid = Number(inv.amountPaid ?? 0);
  const total = Number(inv.total ?? 0);
  const due = Math.max(0, total - paid);

  return (
    <div className="space-y-5 text-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{t("رقم الفاتورة", "Invoice number")}</p><p className="mt-1 font-bold font-mono">{inv.invoiceNumber || "—"}</p></div>
        <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{t("التاريخ", "Date")}</p><p className="mt-1 font-semibold">{inv.createdAt ? new Date(inv.createdAt).toLocaleString() : "—"}</p></div>
        <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{t("الكاشير", "Cashier")}</p><p className="mt-1 font-semibold">{inv.cashier?.name || "—"}</p></div>
        <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{t("العميل", "Customer")}</p><p className="mt-1 font-semibold">{inv.customer?.name || t("عميل نقدي", "Walk-in customer")}</p><p className="mt-1 text-xs text-slate-400">{inv.customer?.phone || ""}</p></div>
        <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{t("طريقة الدفع", "Payment method")}</p><p className="mt-1 font-semibold">{inv.paymentMethod || "—"}</p></div>
        <div className="rounded-xl bg-indigo-50 p-4"><p className="text-xs text-indigo-600">{t("حالة السداد", "Payment status")}</p><p className="mt-1 font-bold text-indigo-800">{due <= 0.009 ? t("مدفوعة بالكامل", "Paid in full") : t("متبقي للتحصيل", "Outstanding balance")}</p><p className="mt-1 font-semibold">{money(due)} {t("ج.م", "EGP")}</p></div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="flex items-center justify-between bg-slate-50 px-4 py-3"><h4 className="font-bold text-slate-800">{t("أصناف الفاتورة", "Invoice items")}</h4><span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-500">{items.length} {t("صنف", "items")}</span></div>
        {items.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-xs"><thead><tr className="border-b text-slate-500"><th className="px-4 py-3 text-start">{t("المنتج", "Product")}</th><th className="px-4 py-3 text-center">{t("الكمية", "Qty")}</th><th className="px-4 py-3 text-end">{t("سعر الوحدة", "Unit price")}</th><th className="px-4 py-3 text-end">{t("الإجمالي", "Line total")}</th></tr></thead><tbody>{items.map((item, index) => <tr key={item.id || index} className="border-b last:border-0"><td className="px-4 py-3 font-semibold">{item.productName || item.name || t("منتج", "Product")}{Array.isArray(item.imeiNumbers) && item.imeiNumbers.length > 0 && <p className="mt-1 break-all font-mono text-[10px] text-slate-400">IMEI: {item.imeiNumbers.join(", ")}</p>}</td><td className="px-4 py-3 text-center">{Number(item.quantity || 0)}</td><td className="px-4 py-3 text-end">{money(item.unitPrice)}</td><td className="px-4 py-3 text-end font-bold">{money(item.lineTotal)}</td></tr>)}</tbody></table></div> : <p className="p-6 text-center text-slate-400">{t("لا توجد أصناف في بيانات الفاتورة", "No items were returned for this invoice")}</p>}
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 p-4">
        <div className="flex justify-between text-slate-600"><span>{t("المجموع الفرعي", "Subtotal")}</span><span>{money(inv.subtotal)}</span></div>
        {Number(inv.discountAmount || 0) > 0 && <div className="flex justify-between text-emerald-700"><span>{t("الخصم", "Discount")}</span><span>−{money(inv.discountAmount)}</span></div>}
        {Number(inv.taxAmount || 0) > 0 && <div className="flex justify-between"><span>{t("الضريبة", "Tax")}</span><span>{money(inv.taxAmount)}</span></div>}
        <div className="flex justify-between border-t pt-3 text-base font-black"><span>{t("الإجمالي النهائي", "Grand total")}</span><span className="text-indigo-700">{money(total)} {t("ج.م", "EGP")}</span></div>
        <div className="flex justify-between"><span>{t("المدفوع", "Paid")}</span><span className="font-bold text-emerald-700">{money(paid)} {t("ج.م", "EGP")}</span></div>
        {Number(inv.changeGiven || 0) > 0 && <div className="flex justify-between text-emerald-700"><span>{t("الباقي للعميل", "Change given")}</span><span>{money(inv.changeGiven)}</span></div>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// CUSTOMERS
// ══════════════════════════════════════════════════════════════
export function Customers() {
  const language = useStore((state) => state.language);
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailTab, setDetailTab] = useState("overview");
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const money = (v) => Number(v || 0).toLocaleString(en ? "en-US" : "ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = (v) => v ? new Date(v).toLocaleDateString(en ? "en-US" : "ar-EG") : "—";

  const load = async () => {
    try {
      const { data } = await api.get(`/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`);
      setCustomers(Array.isArray(data) ? data : []);
    } catch { toast.error(t("تعذر تحميل العملاء", "Could not load customers")); }
  };
  useEffect(() => { const timer = setTimeout(load, 180); return () => clearTimeout(timer); }, [search]);

  const openDetails = async (customer) => {
    setSelected(customer); setDetails(null); setDetailTab("overview"); setDetailsLoading(true);
    try {
      const { data } = await api.get(`/customers/${customer.id}/summary`);
      setDetails(data);
    } catch (err) {
      toast.error(err.response?.data?.error || t("تعذر تحميل ملف العميل", "Could not load customer profile"));
    } finally { setDetailsLoading(false); }
  };

  const handleSave = async () => {
    if (!String(form.name || "").trim()) return toast.error(t("اسم العميل مطلوب", "Customer name is required"));
    setSaving(true);
    try {
      const payload = { name: String(form.name).trim(), phone: form.phone || null, email: form.email || null, address: form.address || null, city: form.city || null, notes: form.notes || null };
      if (modal === "add") await api.post("/customers", payload);
      else await api.put(`/customers/${selected.id}`, payload);
      toast.success(t("تم حفظ بيانات العميل", "Customer saved"));
      setModal(null); await load();
      if (modal === "edit" && selected) await openDetails({ ...selected, ...payload });
    } catch (err) { toast.error(err.response?.data?.error || t("فشل الحفظ", "Save failed")); }
    finally { setSaving(false); }
  };

  const summary = details?.summary || {};
  const customer = details?.customer || selected;
  const Stat = ({ label, value, hint, color = "indigo" }) => (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm min-w-0">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-black ${color === "green" ? "text-emerald-600" : color === "rose" ? "text-rose-600" : color === "amber" ? "text-amber-600" : "text-slate-900"} break-words`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-5" dir={en ? "ltr" : "rtl"}>
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-wider text-indigo-600 mb-1">{t("إدارة علاقات العملاء", "CUSTOMER RELATIONSHIP MANAGEMENT")}</p>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900">{t("العملاء", "Customers")}</h1>
          <p className="text-sm text-slate-500 mt-1">{t("ملفات العملاء والمشتريات والنقاط والآجل والصيانة في مكان واحد.", "Customer profiles, purchases, loyalty, credit and repairs in one place.")}</p>
        </div>
        <Btn onClick={() => { setForm({}); setModal("add"); }}><Plus className="w-4 h-4" />{t("إضافة عميل", "Add customer")}</Btn>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={t("عدد العملاء المعروضين", "Customers shown")} value={customers.length} />
        <Stat label={t("عملاء لديهم نقاط", "Customers with points")} value={customers.filter(c => Number(c.loyaltyPoints || 0) > 0).length} color="amber" />
        <Stat label={t("إجمالي نقاط القائمة", "Points in list")} value={customers.reduce((n,c) => n + Number(c.loyaltyPoints || 0),0).toLocaleString()} color="amber" />
        <Stat label={t("بحث سريع", "Quick search")} value={search ? t("نتائج البحث", "Filtered") : t("كل العملاء", "All customers")} hint={t("الاسم أو الهاتف أو البريد", "Name, phone or email")} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-xl">
            <Search className={`absolute ${en ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400`} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("ابحث بالاسم أو رقم الهاتف أو البريد الإلكتروني...", "Search name, phone or email...")} className={`w-full bg-slate-50 border border-slate-200 rounded-xl py-3 ${en ? "pl-10 pr-3" : "pr-10 pl-3"} text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300`} />
          </div>
          <span className="text-xs text-slate-500">{customers.length} {t("عميل", "customers")}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-3 md:p-4">
          {customers.map(c => (
            <button key={c.id} onClick={() => openDetails(c)} className="text-start rounded-2xl border border-slate-200 p-4 hover:border-indigo-300 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-indigo-200">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black text-lg shrink-0">{String(c.name || "?").trim().slice(0,1)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2"><h3 className="font-bold text-slate-900 truncate">{c.name}</h3><span className="text-[10px] rounded-full bg-amber-50 text-amber-700 px-2 py-1 whitespace-nowrap">★ {Number(c.loyaltyPoints || 0).toLocaleString()}</span></div>
                  <p className="text-xs text-slate-500 mt-1 font-mono" dir="ltr">{c.phone || "—"}</p>
                  <p className="text-xs text-slate-400 mt-1 truncate">{c.email || c.city || t("لا توجد تفاصيل إضافية", "No extra details")}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">{t("إجمالي الشراء المسجل", "Recorded purchases")}</p><p className="font-extrabold text-emerald-700 mt-1">{money(c.totalSpent)} {t("ج.م", "EGP")}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">{t("حد الائتمان", "Credit limit")}</p><p className="font-extrabold text-slate-800 mt-1">{money(c.creditLimit)} {t("ج.م", "EGP")}</p></div>
              </div>
              <div className="flex justify-between items-center mt-3 text-xs text-indigo-600 font-bold"><span>{t("فتح الملف الكامل", "Open full profile")}</span><span>{en ? "→" : "←"}</span></div>
            </button>
          ))}
          {!customers.length && <div className="col-span-full text-center py-14 text-slate-400"><span className="block text-2xl mb-2 opacity-40">👥</span>{t("لا يوجد عملاء مطابقون للبحث", "No matching customers found")}</div>}
        </div>
      </section>

      {modal && <Modal title={modal === "add" ? t("إضافة عميل جديد", "Add new customer") : t("تعديل بيانات العميل", "Edit customer")} onClose={() => setModal(null)} footer={<><Btn variant="secondary" onClick={() => setModal(null)}>{t("إلغاء", "Cancel")}</Btn><Btn onClick={handleSave} disabled={saving}>{saving ? t("جارٍ الحفظ...", "Saving...") : t("حفظ البيانات", "Save")}</Btn></>}>
        <div className="space-y-3">
          <Field label={t("اسم العميل *", "Customer name *")}><Input autoFocus value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })}/></Field>
          <Field label={t("رقم الهاتف", "Phone")}><Input dir="ltr" value={form.phone || ""} onChange={e => setForm({ ...form, phone: e.target.value })}/></Field>
          <Field label={t("البريد الإلكتروني", "Email")}><Input type="email" dir="ltr" value={form.email || ""} onChange={e => setForm({ ...form, email: e.target.value })}/></Field>
          <Field label={t("العنوان", "Address")}><Input value={form.address || ""} onChange={e => setForm({ ...form, address: e.target.value })}/></Field>
          <Field label={t("المدينة", "City")}><Input value={form.city || ""} onChange={e => setForm({ ...form, city: e.target.value })}/></Field>
          <Field label={t("ملاحظات داخلية", "Internal notes")}><Input value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })}/></Field>
        </div>
      </Modal>}

      {selected && <Modal title={t("ملف العميل الكامل", "Customer 360 profile")} size="xl" onClose={() => { setSelected(null); setDetails(null); }} footer={<><Btn variant="secondary" onClick={() => { setSelected(null); setDetails(null); }}>{t("إغلاق", "Close")}</Btn><Btn onClick={() => { setForm({ name: customer?.name || "", phone: customer?.phone || "", email: customer?.email || "", address: customer?.address || "", city: customer?.city || "", notes: customer?.notes || "" }); setModal("edit"); }}>{t("تعديل بيانات العميل", "Edit customer")}</Btn></>}>
        {detailsLoading ? <div className="py-16 text-center text-slate-500">{t("جارٍ تحميل ملف العميل...", "Loading customer profile...")}</div> : details ? <div className="space-y-4">
          <div className="rounded-2xl bg-gradient-to-l from-indigo-700 to-slate-900 p-5 text-white">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"><div><p className="text-xs text-indigo-200">{t("ملف العميل", "CUSTOMER PROFILE")}</p><h2 className="text-2xl font-black mt-1">{customer?.name}</h2><p className="text-sm text-indigo-100 mt-2" dir="ltr">{customer?.phone || "—"} {customer?.email ? " · " + customer.email : ""}</p><p className="text-xs text-indigo-200 mt-1">{[customer?.city, customer?.address].filter(Boolean).join(" · ") || t("لا يوجد عنوان مسجل", "No address saved")}</p></div><div className="rounded-2xl bg-white/10 p-4 min-w-36"><p className="text-xs text-indigo-100">{t("نقاط الولاء الحالية", "Current loyalty points")}</p><p className="text-3xl font-black mt-1">★ {Number(summary.loyaltyPoints || customer?.loyaltyPoints || 0).toLocaleString()}</p><p className="text-xs text-indigo-100 mt-1">{t("مكتسبة", "Earned")} {Number(summary.loyaltyEarned || 0)} · {t("مستخدمة", "Redeemed")} {Number(summary.loyaltyRedeemed || 0)}</p></div></div>
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <Stat label={t("عدد فواتير البيع", "Sales invoices")} value={summary.invoiceCount || 0} hint={t("عدد مرات الشراء", "Purchase visits")}/>
            <Stat label={t("إجمالي المبيعات", "Gross purchases")} value={money(summary.grossPurchases)} color="green" hint={t("قبل خصم المرتجعات", "Before returns")}/>
            <Stat label={t("صافي المشتريات", "Net purchases")} value={money(summary.netPurchases)} color="green" hint={t("بعد خصم المرتجعات المسجلة", "After recorded returns")}/>
            <Stat label={t("المتبقي على العميل", "Outstanding credit")} value={money(summary.outstandingCredit)} color={Number(summary.outstandingCredit)>0?"rose":"green"} hint={t("الرصيد المفتوح من الآجل", "Open receivables")}/>
            <Stat label={t("المدفوع وقت البيع", "Paid at sale")} value={money(summary.paidAtSale)}/>
            <Stat label={t("إجمالي المرتجعات", "Returns total")} value={money(summary.returnedTotal)} color="rose"/>
            <Stat label={t("عمليات الآجل", "Credit records")} value={summary.receivableCount || 0}/>
            <Stat label={t("تذاكر الصيانة", "Repair tickets")} value={summary.repairCount || 0}/>
          </div>
          <div className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2">
            {[["overview",t("نظرة عامة","Overview")],["purchases",t("المشتريات","Purchases")],["credit",t("الآجل والتحصيل","Credit & payments")],["loyalty",t("النقاط","Loyalty")],["service",t("الصيانة والاستبدال","Service & trade-in")]].map(([key,label]) => <button key={key} onClick={() => setDetailTab(key)} className={`whitespace-nowrap px-3 py-2 rounded-xl text-xs font-bold ${detailTab===key?"bg-indigo-600 text-white":"bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>)}
          </div>
          {detailTab === "overview" && <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border p-4"><h3 className="font-bold text-slate-800 mb-3">{t("طرق الدفع المستخدمة","Payment methods used")}</h3>{(summary.paymentChannels || []).length ? <div className="space-y-2">{summary.paymentChannels.map(p=><div key={p.method} className="flex justify-between gap-3 text-sm border-b last:border-0 pb-2"><span className="text-slate-600">{p.method}</span><span className="font-bold">{money(p.amount)}</span></div>)}</div> : <p className="text-sm text-slate-400">{t("لا توجد تفاصيل دفع مسجلة","No payment splits recorded")}</p>}</div>
            <div className="rounded-2xl border p-4"><h3 className="font-bold text-slate-800 mb-3">{t("ملخص حساب العميل","Account overview")}</h3><div className="space-y-3 text-sm"><div className="flex justify-between"><span>{t("الرصيد الائتماني المسجل","Stored credit balance")}</span><b>{money(customer?.creditBalance)} </b></div><div className="flex justify-between"><span>{t("حد الائتمان","Credit limit")}</span><b>{money(customer?.creditLimit)}</b></div><div className="flex justify-between"><span>{t("عمليات التحصيل","Collection payments")}</span><b>{summary.paymentCount || 0}</b></div><div className="flex justify-between"><span>{t("عمليات الاستبدال/الشراء من العميل","Trade-ins")}</span><b>{summary.tradeInCount || 0}</b></div><p className="text-xs text-slate-400 pt-2">{t("حركات التحصيل تعني الدفعات المسجلة على مديونيات العميل، وليست تحويلات بنكية شخصية.", "Collections are payments against recorded customer receivables, not personal bank transfers.")}</p></div></div>
          </div>}
          {detailTab === "purchases" && <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[700px] text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3 text-start">{t("رقم الفاتورة","Invoice")}</th><th className="p-3 text-start">{t("الفرع","Branch")}</th><th className="p-3 text-start">{t("التاريخ","Date")}</th><th className="p-3 text-start">{t("الإجمالي","Total")}</th><th className="p-3 text-start">{t("المدفوع","Paid")}</th><th className="p-3 text-start">{t("المرتجعات","Returns")}</th><th className="p-3 text-start">{t("الأصناف","Items")}</th></tr></thead><tbody>{(customer?.invoices || []).map(inv=><tr key={inv.id} className="border-t"><td className="p-3 font-mono font-bold">{inv.invoiceNumber}</td><td className="p-3">{inv.branch?.name || "—"}</td><td className="p-3">{date(inv.createdAt)}</td><td className="p-3 font-bold">{money(inv.total)}</td><td className="p-3">{money(inv.amountPaid)}</td><td className="p-3 text-rose-600">{money((inv.returns||[]).reduce((n,r)=>n+Number(r.total||0),0))}</td><td className="p-3">{(inv.items||[]).reduce((n,it)=>n+Number(it.quantity||0),0)}</td></tr>)}</tbody></table>{!customer?.invoices?.length && <p className="p-8 text-center text-slate-400">{t("لا توجد فواتير","No invoices")}</p>}</div>}
          {detailTab === "credit" && <div className="space-y-3">{(customer?.receivables || []).map(r=><div key={r.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-bold">{r.invoice?.invoiceNumber || t("رصيد آجل","Credit balance")} · {r.branch?.name}</p><p className="text-xs text-slate-500 mt-1">{date(r.createdAt)} · {r.status}</p></div><div className="text-end text-sm"><p>{t("الأصل","Original")}: <b>{money(r.originalAmount)}</b></p><p>{t("المتبقي","Remaining")}: <b className="text-rose-600">{money(r.remaining)}</b></p></div></div>{(r.payments||[]).length>0 && <div className="mt-3 border-t pt-2 space-y-2">{r.payments.map(p=><div key={p.id} className="flex justify-between text-xs gap-2"><span>{date(p.createdAt)} · {p.user?.name || "—"} · {p.notes || p.reference || "—"}</span><b className="text-emerald-700">{money(p.amount)}</b></div>)}</div>}</div>)}{!(customer?.receivables||[]).length && <p className="text-center p-8 text-slate-400">{t("لا توجد مديونيات أو عمليات تحصيل مسجلة","No credit or collection records")}</p>}</div>}
          {detailTab === "loyalty" && <div className="space-y-3"><div className="grid sm:grid-cols-3 gap-3"><Stat label={t("الرصيد الحالي","Current balance")} value={Number(summary.loyaltyPoints||0)} color="amber"/><Stat label={t("إجمالي المكتسب","Earned")} value={Number(summary.loyaltyEarned||0)} color="green"/><Stat label={t("إجمالي المستخدم","Redeemed")} value={Number(summary.loyaltyRedeemed||0)} color="rose"/></div><div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[550px] text-sm"><thead className="bg-slate-50"><tr><th className="p-3 text-start">{t("التاريخ","Date")}</th><th className="p-3 text-start">{t("الحركة","Activity")}</th><th className="p-3 text-start">{t("النقاط","Points")}</th><th className="p-3 text-start">{t("ملاحظات","Notes")}</th></tr></thead><tbody>{(customer?.loyaltyTransactions||[]).map(x=><tr key={x.id} className="border-t"><td className="p-3">{date(x.createdAt)}</td><td className="p-3">{x.type}</td><td className={`p-3 font-bold ${x.points>=0?"text-emerald-600":"text-rose-600"}`}>{x.points>0?"+":""}{x.points}</td><td className="p-3">{x.notes||x.referenceType||"—"}</td></tr>)}</tbody></table>{!(customer?.loyaltyTransactions||[]).length && <p className="p-8 text-center text-slate-400">{t("لا توجد حركات نقاط مسجلة","No loyalty transactions recorded")}</p>}</div></div>}
          {detailTab === "service" && <div className="grid lg:grid-cols-2 gap-4"><div className="rounded-xl border p-4"><h3 className="font-bold mb-3">{t("الصيانة","Repairs")}</h3><div className="space-y-3">{(customer?.repairs||[]).map(r=><div key={r.id} className="border-b pb-3 last:border-0"><p className="font-semibold">{r.ticketNumber} · {r.deviceType} {r.deviceBrand||""} {r.deviceModel||""}</p><p className="text-xs text-slate-500 mt-1">{date(r.createdAt)} · {r.status}</p><p className="text-xs mt-1">{r.problemDesc}</p><p className="text-xs text-indigo-600 mt-1">{t("التكلفة الفعلية","Actual cost")}: {money(r.actualCost)} · {t("العربون","Deposit")}: {money(r.deposit)}</p></div>)}{!(customer?.repairs||[]).length && <p className="text-sm text-slate-400">{t("لا توجد تذاكر صيانة","No repair tickets")}</p>}</div></div><div className="rounded-xl border p-4"><h3 className="font-bold mb-3">{t("الاستبدال / شراء جهاز من العميل","Trade-in / buyback")}</h3><div className="space-y-3">{(customer?.tradeIns||[]).map(x=><div key={x.id} className="border-b pb-3 last:border-0"><p className="font-semibold">{x.deviceBrand||""} {x.deviceModel||""} · {x.status}</p><p className="text-xs text-slate-500 mt-1">{date(x.createdAt)} · {x.branch?.name}</p><p className="text-xs mt-1">{t("القيمة النهائية","Final value")}: {money(x.finalValue)}</p></div>)}{!(customer?.tradeIns||[]).length && <p className="text-sm text-slate-400">{t("لا توجد عمليات استبدال مسجلة","No trade-in records")}</p>}</div></div></div>}
        </div> : <div className="py-12 text-center text-slate-400">{t("تعذر تحميل البيانات", "Unable to load profile")}</div>}
      </Modal>}
    </div>
  );
}

// REPAIRS
// ══════════════════════════════════════════════════════════════
const REPAIR_STATUSES = { RECEIVED: { label: "مستلم", color: "blue" }, DIAGNOSING: { label: "تشخيص", color: "yellow" }, UNDER_REPAIR: { label: "قيد الإصلاح", color: "orange" }, WAITING_PARTS: { label: "انتظار قطع", color: "purple" }, COMPLETED: { label: "مكتمل", color: "green" }, DELIVERED: { label: "تم التسليم", color: "slate" }, CANCELLED: { label: "ملغي", color: "red" } };

export function Repairs() {
  const language = useStore((state) => state.language);
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;
  const { activeBranch } = useStore();
  const [tickets, setTickets] = useState([]);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState({ deviceType: "موبايل", problemDesc: "" });
  const [customers, setCustomers] = useState([]);

  const load = async () => {
    const params = new URLSearchParams({ limit: 30, ...(activeBranch?.id && { branchId: activeBranch.id }), ...(statusFilter && { status: statusFilter }) });
    const { data } = await api.get(`/repairs?${params}`).catch(() => ({ data: { tickets: [] } }));
    setTickets(data.tickets || []);
  };

  useEffect(() => { load(); api.get("/customers").then(({ data }) => setCustomers(data)).catch(() => {}); }, [statusFilter, activeBranch?.id]);

  const handleSave = async () => {
    try {
      if (modal === "add") await api.post("/repairs", form);
      else await api.put(`/repairs/${selected.id}`, form);
      toast.success("تم الحفظ"); setModal(null); load();
    } catch (err) { toast.error(err.response?.data?.error || "فشل الحفظ"); }
  };

  const updateStatus = async (id, status) => {
    try { await api.put(`/repairs/${id}`, { status }); toast.success("تم تحديث الحالة"); load(); }
    catch { toast.error("فشل التحديث"); }
  };

  return (
    <div className="p-6" dir={en ? "ltr" : "rtl"}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">{t("الصيانة والإصلاح", "Repairs & Service")}</h2>
        <Btn onClick={() => { setForm({ deviceType: "موبايل", problemDesc: "" }); setModal("add"); }}><Plus className="w-4 h-4" /> تذكرة جديدة</Btn>
      </div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setStatusFilter("")} className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${!statusFilter ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{t("الكل", "All")}</button>
        {Object.entries(REPAIR_STATUSES).map(([val, { label, color }]) => (
          <button key={val} onClick={() => setStatusFilter(statusFilter === val ? "" : val)} className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${statusFilter === val ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{label}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tickets.map((t) => {
          const st = REPAIR_STATUSES[t.status] || { label: t.status, color: "slate" };
          return (
            <div key={t.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-slate-800 font-mono text-sm">{t.ticketNumber}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t.customer?.name || "بدون عميل"} • {t.customer?.phone}</p>
                </div>
                <Badge color={st.color}>{st.label}</Badge>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">{t.deviceType} {t.deviceBrand && `— ${t.deviceBrand}`} {t.deviceModel && t.deviceModel}</p>
                {t.imei && <p className="text-xs text-slate-400 font-mono">IMEI: {t.imei}</p>}
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.problemDesc}</p>
              </div>
              {t.estimatedCost && <div className="text-sm"><span className="text-slate-500">تقدير: </span><span className="font-bold text-indigo-600">{parseFloat(t.estimatedCost).toLocaleString()} ج</span></div>}
              <div className="flex gap-2">
                <button onClick={() => { setSelected(t); setForm({ ...t }); setModal("edit"); }} className="flex-1 border border-slate-200 py-1.5 rounded-lg text-xs font-medium hover:bg-slate-50">{t("تعديل", "Edit")}</button>
                <Select className="flex-1 text-xs border border-slate-200 rounded-lg py-1.5 px-2 bg-white" value={t.status} onChange={(e) => updateStatus(t.id, e.target.value)}>
                  {Object.entries(REPAIR_STATUSES).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
                </Select>
              </div>
              <p className="text-[10px] text-slate-400">{new Date(t.createdAt).toLocaleString("ar-EG")}</p>
            </div>
          );
        })}
        {tickets.length === 0 && <div className="col-span-3 text-center py-12 text-slate-400">{t("لا توجد تذاكر", "No repair tickets")}</div>}
      </div>
      {modal && (
        <Modal title={modal === "add" ? "تذكرة صيانة جديدة" : "تعديل التذكرة"} onClose={() => setModal(null)} footer={<><Btn variant="secondary" onClick={() => setModal(null)}>{t("إلغاء", "Cancel")}</Btn><Btn onClick={handleSave}>{t("حفظ", "Save")}</Btn></>}>
          <div className="space-y-3">
            <Field label="العميل">
              <Select value={form.customerId || ""} onChange={(e) => setForm({ ...form, customerId: e.target.value || undefined })}>
                <option value="">{t("بدون عميل", "No customer")}</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="نوع الجهاز *"><Input value={form.deviceType || ""} onChange={(e) => setForm({ ...form, deviceType: e.target.value })} /></Field>
              <Field label="الماركة"><Input value={form.deviceBrand || ""} onChange={(e) => setForm({ ...form, deviceBrand: e.target.value })} /></Field>
              <Field label="الموديل"><Input value={form.deviceModel || ""} onChange={(e) => setForm({ ...form, deviceModel: e.target.value })} /></Field>
            </div>
            <Field label="رقم IMEI"><Input value={form.imei || ""} onChange={(e) => setForm({ ...form, imei: e.target.value })} placeholder="اختياري" /></Field>
            <Field label="وصف المشكلة *"><textarea value={form.problemDesc || ""} onChange={(e) => setForm({ ...form, problemDesc: e.target.value })} rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="التكلفة التقديرية"><Input type="number" value={form.estimatedCost || ""} onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })} /></Field>
              <Field label="العربون"><Input type="number" value={form.deposit || ""} onChange={(e) => setForm({ ...form, deposit: e.target.value })} /></Field>
            </div>
            {modal === "edit" && (
              <Field label="الحالة">
                <Select value={form.status || "RECEIVED"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(REPAIR_STATUSES).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
                </Select>
              </Field>
            )}
            <Field label="ملاحظات الفني"><Input value={form.diagnosisNotes || ""} onChange={(e) => setForm({ ...form, diagnosisNotes: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// TRANSFERS
// ══════════════════════════════════════════════════════════════
export function Transfers() {
  const language = useStore((state) => state.language);
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;
  const { activeBranch, branches, fetchBranches } = useStore();
  const [transfers, setTransfers] = useState([]);
  const [modal, setModal] = useState(false);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ destBranchId: "", notes: "", items: [{ productId: "", quantity: 1 }] });

  const load = async () => {
    const params = new URLSearchParams({ limit: 30, ...(activeBranch?.id && { branchId: activeBranch.id }) });
    const { data } = await api.get(`/transfers?${params}`).catch(() => ({ data: { transfers: [] } }));
    setTransfers(data.transfers || []);
  };

  useEffect(() => { load(); fetchBranches(); api.get("/products?limit=100").then(({ data }) => setProducts(data.products)).catch(() => {}); }, [activeBranch?.id]);

  const handleCreate = async () => {
    try {
      await api.post("/transfers", { ...form, sourceBranchId: activeBranch?.id });
      toast.success("تم إنشاء طلب النقل"); setModal(false); load();
    } catch (err) { toast.error(err.response?.data?.error || "فشل إنشاء النقل"); }
  };

  const updateStatus = async (id, status) => {
    try { await api.put(`/transfers/${id}/status`, { status }); toast.success(`تم ${status === "COMPLETED" ? "إتمام" : "إلغاء"} النقل`); load(); }
    catch (err) { toast.error(err.response?.data?.error || "فشل"); }
  };

  const ST = { PENDING: { label: "معلق", color: "yellow" }, COMPLETED: { label: "مكتمل", color: "green" }, CANCELLED: { label: "ملغي", color: "red" } };

  return (
    <div className="p-6" dir={en ? "ltr" : "rtl"}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">{t("نقل المخزون", "Stock transfers")}</h2>
        <Btn onClick={() => setModal(true)}><Plus className="w-4 h-4" /> نقل جديد</Btn>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-slate-50 text-right text-slate-500 text-xs">
            <th className="px-4 py-3 font-semibold">{t("الرقم المرجعي", "Reference")}</th><th className="px-4 py-3 font-semibold">{t("من", "From")}</th><th className="px-4 py-3 font-semibold">{t("إلى", "To")}</th><th className="px-4 py-3 font-semibold">{t("العناصر", "Items")}</th><th className="px-4 py-3 font-semibold">{t("الحالة", "Status")}</th><th className="px-4 py-3 font-semibold">{t("التاريخ", "Date")}</th><th className="px-4 py-3 font-semibold">{t("إجراءات", "Actions")}</th>
          </tr></thead>
          <tbody>
            {transfers.map((t) => {
              const st = ST[t.status] || { label: t.status, color: "slate" };
              return (
                <tr key={t.id} className="border-b hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-indigo-600 font-semibold">{t.referenceNumber}</td>
                  <td className="px-4 py-3 text-slate-600">{t.sourceBranch?.name}</td>
                  <td className="px-4 py-3 text-slate-600">{t.destBranch?.name}</td>
                  <td className="px-4 py-3"><Badge color="blue">{t._count?.items || 0} صنف</Badge></td>
                  <td className="px-4 py-3"><Badge color={st.color}>{st.label}</Badge></td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{new Date(t.createdAt).toLocaleDateString("ar-EG")}</td>
                  <td className="px-4 py-3">
                    {t.status === "PENDING" && (
                      <div className="flex gap-1">
                        <button onClick={() => updateStatus(t.id, "COMPLETED")} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-lg hover:bg-green-200">{t("تأكيد", "Confirm")}</button>
                        <button onClick={() => updateStatus(t.id, "CANCELLED")} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-lg hover:bg-red-200">{t("إلغاء", "Cancel")}</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {transfers.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-slate-400">{t("لا توجد عمليات نقل", "No transfers")}</td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title="طلب نقل مخزون جديد" onClose={() => setModal(false)} footer={<><Btn variant="secondary" onClick={() => setModal(false)}>{t("إلغاء", "Cancel")}</Btn><Btn onClick={handleCreate}>{t("إرسال الطلب", "Submit transfer")}</Btn></>}>
          <div className="space-y-3">
            <Field label="الفرع المستلم *">
              <Select value={form.destBranchId} onChange={(e) => setForm({ ...form, destBranchId: e.target.value })}>
                <option value="">{t("اختر فرعاً", "Select a branch")}</option>
                {branches.filter((b) => b.id !== activeBranch?.id).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
            <Field label="ملاحظات"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-700">{t("المنتجات", "Products")}</p>
              {form.items.map((item, i) => (
                <div key={i} className="flex gap-2">
                  <Select value={item.productId} onChange={(e) => { const items = [...form.items]; items[i].productId = e.target.value; setForm({ ...form, items }); }} className="flex-1">
                    <option value="">{t("اختر منتجاً", "Select a product")}</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                  <Input type="number" value={item.quantity} onChange={(e) => { const items = [...form.items]; items[i].quantity = parseInt(e.target.value); setForm({ ...form, items }); }} min={1} className="w-20" />
                  {form.items.length > 1 && <button onClick={() => setForm({ ...form, items: form.items.filter((_, j) => j !== i) })} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>}
                </div>
              ))}
              <button onClick={() => setForm({ ...form, items: [...form.items, { productId: "", quantity: 1 }] })} className="text-indigo-600 text-sm hover:underline flex items-center gap-1"><Plus className="w-4 h-4" /> إضافة منتج</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// EXPENSES
// ══════════════════════════════════════════════════════════════
const EXP_CATS = { RENT: "إيجار", SALARIES: "رواتب", UTILITIES: "مرافق", MAINTENANCE: "صيانة", TRANSPORT: "مواصلات", MARKETING: "تسويق", SUPPLIES: "مستلزمات", TAXES: "ضرائب", OTHER: "أخرى" };

export function Expenses() {
  const language = useStore((state) => state.language);
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;
  const { activeBranch } = useStore();
  const [expenses, setExpenses] = useState([]);
  const [total, setTotal] = useState(0);
  const [modal, setModal] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({ category: "OTHER", description: "", amount: "", accountId: "" });

  const load = async () => {
    const { data } = await api.get(`/expenses${activeBranch?.id ? `?branchId=${activeBranch.id}` : ""}`).catch(() => ({ data: { expenses: [], total: 0 } }));
    setExpenses(data.expenses || []); setTotal(parseFloat(data.total || 0));
  };

  useEffect(() => { load(); api.get("/finance/accounts").then(({data}) => setAccounts(data)).catch(() => setAccounts([])); }, [activeBranch?.id]);

  const handleSave = async () => {
    try { const { data } = await api.post("/expenses", form); toast.success(data?.approvalRequired ? "تم إرسال المصروف للموافقة" : "تم إضافة المصروف"); setModal(false); setForm({ category: "OTHER", description: "", amount: "", accountId: "" }); load(); }
    catch (err) { toast.error(err.response?.data?.error || "فشل"); }
  };

  return (
    <div className="p-6" dir={en ? "ltr" : "rtl"}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{t("المصروفات", "Expenses")}</h2>
          <p className="text-slate-500 text-sm mt-1">إجمالي: <span className="font-bold text-red-600">{total.toLocaleString()} ج</span></p>
        </div>
        <Btn onClick={() => setModal(true)}><Plus className="w-4 h-4" /> مصروف جديد</Btn>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-slate-50 text-right text-slate-500 text-xs">
            <th className="px-4 py-3 font-semibold">{t("التصنيف", "Category")}</th><th className="px-4 py-3 font-semibold">{t("الوصف", "Description")}</th><th className="px-4 py-3 font-semibold">{t("المبلغ", "Amount")}</th><th className="px-4 py-3 font-semibold">{t("الحساب", "Account")}</th><th className="px-4 py-3 font-semibold">{t("بواسطة", "Created by")}</th><th className="px-4 py-3 font-semibold">{t("التاريخ", "Date")}</th>
          </tr></thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-b hover:bg-slate-50">
                <td className="px-4 py-3"><Badge color="orange">{EXP_CATS[e.category] || e.category}</Badge></td>
                <td className="px-4 py-3 text-slate-600">{e.description}</td>
                <td className="px-4 py-3 font-bold text-red-600">{parseFloat(e.amount).toLocaleString()} ج</td>
                <td className="px-4 py-3 text-slate-600">{e.financialTransaction?.account?.name || "الخزنة"}</td>
                <td className="px-4 py-3 text-slate-500">{e.user?.name}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{new Date(e.paidAt).toLocaleDateString("ar-EG")}</td>
              </tr>
            ))}
            {expenses.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-slate-400">{t("لا توجد مصروفات", "No expenses found")}</td></tr>}
          </tbody>
        </table>
      </div>
      {modal && (
        <Modal title="إضافة مصروف" onClose={() => setModal(false)} footer={<><Btn variant="secondary" onClick={() => setModal(false)}>{t("إلغاء", "Cancel")}</Btn><Btn onClick={handleSave}>{t("حفظ", "Save")}</Btn></>}>
          <div className="space-y-3">
            <Field label="التصنيف *">
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {Object.entries(EXP_CATS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="الوصف *"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="وصف المصروف" /></Field>
            <Field label="المبلغ *"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" min={0} step={0.01} /></Field>
            <Field label="الدفع من *"><Select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}><option value="">{t("الخزنة الافتراضية", "Default cashbox")}</option>{accounts.filter(a=>a.isActive).map(a=><option key={a.id} value={a.id}>{a.name} — {parseFloat(a.balance).toFixed(2)}</option>)}</Select></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// USERS
// ══════════════════════════════════════════════════════════════
const ROLES = { SUPER_ADMIN: "مدير عام", BRANCH_MANAGER: "مدير فرع", CASHIER: "كاشير", INVENTORY_MANAGER: "مدير مخزون", ACCOUNTANT: "محاسب", TECHNICIAN: "فني" };

export function Users() {
  const language = useStore((state) => state.language);
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;
  const { branches, fetchBranches } = useStore();
  const currentUser = useStore((state) => state.user);
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  const { confirm } = useDialog();
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [summaryUser, setSummaryUser] = useState(null);
  const [form, setForm] = useState({ role: "CASHIER", isActive: true });

  const load = async () => {
    const { data } = await api.get("/users").catch(() => ({ data: [] }));
    setUsers(data);
  };

  useEffect(() => { load(); fetchBranches(); }, []);

  const handleDelete = async (user) => {
    if (!isSuperAdmin) return;
    const ok = await confirm(t(`هل تريد حذف المستخدم ${user.name}؟ إذا كان مرتبطًا بعمليات مالية أو تشغيلية فلن يسمح النظام بالحذف حفاظًا على السجلات.`, `Delete ${user.name}? Users with operational or financial history cannot be permanently deleted.`), { title: t("تأكيد حذف المستخدم", "Confirm user deletion"), danger: true, confirmLabel: t("حذف المستخدم", "Delete user") });
    if (!ok) return;
    try { await api.delete(`/users/${user.id}`); toast.success(t("تم حذف المستخدم", "User deleted")); await load(); }
    catch (err) { toast.error(err.response?.data?.error || t("تعذر حذف المستخدم", "Could not delete user")); }
  };
  const money = (value) => Number(value || 0).toLocaleString(en ? "en-US" : "ar-EG", { maximumFractionDigits: 2 });

  const handleSave = async () => {
    try {
      if (modal === "add") await api.post("/users", form);
      else await api.put(`/users/${selected.id}`, form);
      toast.success("تم الحفظ"); setModal(null); load();
    } catch (err) { toast.error(err.response?.data?.error || "فشل الحفظ"); }
  };

  const ROLE_COLORS = { SUPER_ADMIN: "red", BRANCH_MANAGER: "purple", CASHIER: "blue", INVENTORY_MANAGER: "green", ACCOUNTANT: "orange", TECHNICIAN: "yellow" };

  return (
    <div className="p-6" dir={en ? "ltr" : "rtl"}>
      <div className="flex items-center justify-between mb-6 gap-3">
        <div><h2 className="text-2xl font-bold text-slate-800">{t("إدارة المستخدمين", "User management")}</h2><p className="text-sm text-slate-500 mt-1">{t("ملخص أداء كل موظف وإدارة حساباته", "Employee performance summaries and account administration")}</p></div>
        <Btn onClick={() => { setForm({ role: "CASHIER", isActive: true, password: "", maxDiscountPct: 15 }); setModal("add"); }}><Plus className="w-4 h-4" /> {t("مستخدم جديد", "New user")}</Btn>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: t("إجمالي المستخدمين", "Total users"), value: users.length, color: "text-indigo-700" },
          { label: t("الحسابات النشطة", "Active accounts"), value: users.filter(x => x.isActive).length, color: "text-emerald-700" },
          { label: t("عمليات البيع", "Sales"), value: users.reduce((n,x)=>n+Number(x.salesCount||0),0), color: "text-sky-700" },
          { label: t("الاسترجاعات", "Returns"), value: users.reduce((n,x)=>n+Number(x.returnsCount||0),0), color: "text-amber-700" },
        ].map(card => <div key={card.label} className="rounded-2xl border bg-white p-4 shadow-sm"><div className="text-sm text-slate-500">{card.label}</div><div className={"mt-2 text-2xl font-bold " + card.color}>{Number(card.value).toLocaleString(en ? "en-US" : "ar-EG")}</div></div>)}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full min-w-[1050px] text-sm">
          <thead><tr className="border-b bg-slate-50 text-right text-slate-500 text-xs">
            <th className="px-4 py-3 font-semibold">{t("المستخدم", "User")}</th><th className="px-4 py-3 font-semibold">{t("اسم المستخدم", "Username")}</th><th className="px-4 py-3 font-semibold">{t("الدور", "Role")}</th><th className="px-4 py-3 font-semibold">{t("الفرع", "Branch")}</th><th className="px-4 py-3 font-semibold">{t("الحالة", "Status")}</th><th className="px-4 py-3 font-semibold">{t("آخر دخول", "Last login")}</th><th className="px-4 py-3 font-semibold">{t("ملخص", "Summary")}</th><th className="px-4 py-3 font-semibold">{t("إجراءات", "Actions")}</th>
          </tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 text-xs font-bold">{u.name?.slice(0, 2)}</div>
                    <span className="font-semibold text-slate-800">{u.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-slate-600">{u.username}</td>
                <td className="px-4 py-3"><Badge color={ROLE_COLORS[u.role] || "slate"}>{ROLES[u.role] || u.role}</Badge></td>
                <td className="px-4 py-3 text-slate-600">{u.branch?.name || "—"}</td>
                <td className="px-4 py-3"><Badge color={u.isActive ? "green" : "red"}>{u.isActive ? "فعال" : "معطل"}</Badge></td>
                <td className="px-4 py-3 text-slate-500 text-xs">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("ar-EG") : "لم يدخل بعد"}</td>
                <td className="px-4 py-3"><Btn variant="secondary" onClick={() => setSummaryUser(u)} className="!py-1.5 !px-2"><FileText className="w-4 h-4" />{t("عرض الملخص", "View summary")}</Btn></td><td className="px-4 py-3"><div className="flex items-center gap-1"><button title={t("تعديل", "Edit")} onClick={() => { setSelected(u); setForm({ name: u.name, email: u.email, role: u.role, branchId: u.branchId, isActive: u.isActive, password: "", maxDiscountPct: u.maxDiscountPct ?? 15, permissions: u.permissions || {} }); setModal("edit"); }} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"><Edit2 className="w-4 h-4" /></button>{isSuperAdmin && <button title={t("حذف المستخدم", "Delete user")} onClick={() => handleDelete(u)} className="p-2 hover:bg-red-50 rounded-lg text-red-600"><Trash2 className="w-4 h-4" /></button>}</div></td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={8} className="text-center py-12 text-slate-400">{t("لا يوجد مستخدمون", "No users found")}</td></tr>}
          </tbody>
        </table>
      </div>
      {summaryUser && (
        <Modal title={t("ملخص الموظف", "Employee summary") + " — " + summaryUser.name} size="xl" onClose={() => setSummaryUser(null)} footer={<Btn variant="secondary" onClick={() => setSummaryUser(null)}>{t("إغلاق", "Close")}</Btn>}>
          <div className="space-y-5">
            <div className="rounded-2xl bg-gradient-to-l from-slate-900 to-indigo-900 p-5 text-white flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center text-xl font-bold">{summaryUser.name?.slice(0,2)}</div>
              <div className="flex-1"><h3 className="text-xl font-bold">{summaryUser.name}</h3><p className="text-sm text-white/70">{summaryUser.username} · {summaryUser.branch?.name || t("بدون فرع", "No branch")}</p><p className="text-sm mt-1">{ROLES[summaryUser.role] || summaryUser.role} · {summaryUser.isActive ? t("حساب نشط", "Active") : t("حساب معطل", "Inactive")}</p></div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                [t("عدد المبيعات", "Sales count"), summaryUser.salesCount || 0, "text-emerald-700", "bg-emerald-50"],
                [t("قيمة المبيعات", "Sales value"), money(summaryUser.salesTotal) + " ج", "text-emerald-700", "bg-emerald-50"],
                [t("عدد الاسترجاعات", "Returns count"), summaryUser.returnsCount || 0, "text-amber-700", "bg-amber-50"],
                [t("قيمة الاسترجاعات", "Returns value"), money(summaryUser.returnsTotal) + " ج", "text-amber-700", "bg-amber-50"],
                [t("صافي المبيعات", "Net sales"), money(summaryUser.netSales) + " ج", "text-indigo-700", "bg-indigo-50"],
                [t("تذاكر الصيانة", "Repair tickets"), summaryUser.repairsCount || 0, "text-sky-700", "bg-sky-50"],
                [t("المصروفات المسجلة", "Expenses recorded"), summaryUser.expensesCount || 0, "text-orange-700", "bg-orange-50"],
                [t("قيمة المصروفات", "Expense value"), money(summaryUser.expensesTotal) + " ج", "text-orange-700", "bg-orange-50"],
                [t("حد الخصم", "Discount limit"), Number(summaryUser.maxDiscountPct || 0) + "%", "text-violet-700", "bg-violet-50"],
              ].map(([label,value,color,bg]) => <div key={label} className={"rounded-xl border border-slate-100 p-4 " + bg}><div className="text-sm text-slate-600">{label}</div><div className={"mt-2 text-xl font-bold " + color}>{value}</div></div>)}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-600"><div className="rounded-xl border p-3">{t("تاريخ إنشاء الحساب", "Account created")}: <strong>{summaryUser.createdAt ? new Date(summaryUser.createdAt).toLocaleDateString(en ? "en-US" : "ar-EG") : "—"}</strong></div><div className="rounded-xl border p-3">{t("آخر دخول", "Last login")}: <strong>{summaryUser.lastLoginAt ? new Date(summaryUser.lastLoginAt).toLocaleString(en ? "en-US" : "ar-EG") : t("لم يدخل بعد", "Never logged in")}</strong></div></div>
          </div>
        </Modal>
      )}
      {(modal === "add" || modal === "edit") && (
        <Modal title={modal === "add" ? "مستخدم جديد" : "تعديل المستخدم"} onClose={() => setModal(null)} footer={<><Btn variant="secondary" onClick={() => setModal(null)}>{t("إلغاء", "Cancel")}</Btn><Btn onClick={handleSave}>{t("حفظ", "Save")}</Btn></>}>
          <div className="space-y-3">
            <Field label="الاسم الكامل *"><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            {modal === "add" && <Field label="اسم المستخدم *"><Input value={form.username || ""} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>}
            <Field label="البريد الإلكتروني"><Input type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label={modal === "add" ? "كلمة المرور *" : "كلمة المرور الجديدة (اترك فارغاً للإبقاء)"}><Input type="password" value={form.password || ""} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="الدور">
                <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {Object.entries(ROLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
              <Field label="الفرع">
                <Select value={form.branchId || ""} onChange={(e) => setForm({ ...form, branchId: e.target.value || undefined })}>
                  <option value="">{t("بدون فرع", "No branch")}</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 space-y-3"><div><h4 className="font-bold text-slate-800">صلاحيات الصفحات</h4><p className="text-xs text-slate-500 mt-1">فعّل أو أوقف الصفحات لهذا المستخدم</p></div><div className="grid grid-cols-2 gap-2">{[["dashboard","لوحة التحكم"],["pos","نقطة البيع"],["inventory","المخزون"],["stockLedger","حركة المخزون"],["purchases","المشتريات"],["receivables","الآجل والأقساط"],["approvals","الموافقات"],["growth","العروض"],["closing","الإقفال اليومي"],["tools","الباركود والاستيراد"],["stocktake","الجرد"],["reports","التقارير"],["settings","الإعدادات"],["sales","المبيعات"],["customers","العملاء"],["repairs","الصيانة"],["transfers","نقل المخزون"],["expenses","المصروفات"],["finance","المالية والمحافظ"],["returns","المرتجعات"],["sync","مركز المزامنة"]].map(([key,label])=><label key={key} className="flex items-center justify-between gap-2 rounded-xl bg-white border p-2.5 text-sm"><span>{label}</span><input type="checkbox" checked={form.permissions?.pages?.[key]!==false} onChange={e=>setForm({...form,permissions:{...(form.permissions||{}),pages:{...(form.permissions?.pages||{}),[key]:e.target.checked}}})} className="accent-indigo-600 w-4 h-4"/></label>)}</div><div className="flex gap-2"><button type="button" onClick={()=>setForm({...form,permissions:{...(form.permissions||{}),pages:Object.fromEntries(["dashboard","pos","inventory","stockLedger","purchases","receivables","approvals","growth","closing","tools","stocktake","reports","settings","sales","customers","repairs","transfers","expenses","finance","returns","sync"].map(k=>[k,true]))}})} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-indigo-700">تفعيل الكل</button><button type="button" onClick={()=>setForm({...form,permissions:{...(form.permissions||{}),pages:Object.fromEntries(["dashboard","pos","inventory","stockLedger","purchases","receivables","approvals","growth","closing","tools","stocktake","reports","settings","sales","customers","repairs","transfers","expenses","finance","returns","sync"].map(k=>[k,false]))}})} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-rose-700">إيقاف الكل</button></div></div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 space-y-3"><h4 className="font-bold text-slate-800">صلاحيات الإجراءات</h4><div className="grid grid-cols-2 gap-2">{[["create","إضافة / إنشاء"],["edit","تعديل"],["delete","حذف"],["approve","اعتماد"],["refund","مرتجعات ورد أموال"],["discount","الخصومات"],["export","تصدير التقارير"],["manageFinance","إدارة المالية"],["manageUsers","إدارة المستخدمين"],["manageBranches","إدارة الفروع"]].map(([key,label])=><label key={key} className="flex items-center justify-between gap-2 rounded-xl bg-white border p-2.5 text-sm"><span>{label}</span><input type="checkbox" checked={form.permissions?.actions?.[key]!==false} onChange={e=>setForm({...form,permissions:{...(form.permissions||{}),actions:{...(form.permissions?.actions||{}),[key]:e.target.checked}}})} className="accent-emerald-600 w-4 h-4"/></label>)}</div><p className="text-xs text-amber-700">صلاحيات الصفحات تُطبّق على القائمة والتنقل. صلاحيات الإجراءات تُحفظ في حساب المستخدم، ويجب ربط كل إجراء بالـ API الخاص به لاستكمال فرضها أمنيًا.</p></div>
            <Field label="أقصى خصم مسموح %"><Input type="number" min={0} max={100} value={form.maxDiscountPct ?? 15} onChange={(e) => setForm({ ...form, maxDiscountPct: Number(e.target.value) })} /></Field>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isActive !== false} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4 accent-indigo-600" />
              <span className="text-sm font-medium text-slate-700">{t("حساب فعال", "Active account")}</span>
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}