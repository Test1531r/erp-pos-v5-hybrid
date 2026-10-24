import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, useStore } from "../store/index.js";
import { ArrowLeft, Package, Barcode, Layers3, Boxes, Pencil, RefreshCw, Image as ImageIcon, Tag, Building2, CalendarDays, ShieldCheck, AlertTriangle, Smartphone, Hash } from "lucide-react";
import toast from "react-hot-toast";

const money = (value, en) => Number(value || 0).toLocaleString(en ? "en-US" : "ar-EG", { maximumFractionDigits: 2 });
const dateText = (value, en) => value ? new Date(value).toLocaleString(en ? "en-US" : "ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "—";

function Metric({ label, value, hint, tone = "slate" }) {
  const tones = { slate: "bg-slate-50 text-slate-900", indigo: "bg-indigo-50 text-indigo-800", emerald: "bg-emerald-50 text-emerald-800", amber: "bg-amber-50 text-amber-800" };
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold text-slate-500">{label}</p><p className={`mt-2 text-2xl font-black ${tones[tone] || tones.slate} rounded-lg inline-block px-2 py-1`}>{value}</p>{hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}</div>;
}

function Data({ label, value, mono = false }) {
  return <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-3"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 break-words text-sm font-semibold text-slate-800 ${mono ? "font-mono" : ""}`}>{value === null || value === undefined || value === "" ? "—" : String(value)}</p></div>;
}

function StockTable({ inventory, en, t }) {
  if (!inventory?.length) return <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-400">{t("لا توجد أرصدة مخزون مسجلة لهذا المنتج.", "No stock records are available for this product.")}</div>;
  return <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[540px] text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3 text-start">{t("الفرع","Branch")}</th><th className="px-4 py-3 text-start">{t("الكود","Code")}</th><th className="px-4 py-3 text-start">{t("الكمية","Quantity")}</th><th className="px-4 py-3 text-start">{t("آخر تحديث","Updated")}</th></tr></thead><tbody>{inventory.map((row) => <tr key={row.id || row.branchId} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold">{row.branch?.name || row.branchId || "—"}</td><td className="px-4 py-3 font-mono text-slate-500">{row.branch?.code || "—"}</td><td className={`px-4 py-3 font-black ${Number(row.quantity) <= 0 ? "text-rose-600" : "text-emerald-700"}`}>{Number(row.quantity || 0)}</td><td className="px-4 py-3 text-xs text-slate-500">{dateText(row.updatedAt, en)}</td></tr>)}</tbody></table></div>;
}

export default function ProductDetails() {
  const { id } = useParams();
  const language = useStore((state) => state.language);
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [imageFailed, setImageFailed] = useState(false);
  const variants = product?.variants || [];
  const allInventory = useMemo(() => [...(product?.inventory || []), ...variants.flatMap(v => v.inventory || [])], [product, variants]);
  const totalStock = allInventory.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const variantStock = (variant) => (variant.inventory || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setImageFailed(false);
    api.get(`/products/${encodeURIComponent(id)}`)
      .then(({ data }) => { if (alive) setProduct(data); })
      .catch((err) => { if (alive) toast.error(err.response?.data?.error || t("تعذر تحميل بيانات المنتج", "Could not load product details")); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  if (loading) return <div className="p-6"><div className="mx-auto max-w-7xl animate-pulse space-y-4"><div className="h-8 w-56 rounded bg-slate-200"/><div className="h-40 rounded-3xl bg-slate-100"/><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[1,2,3,4].map(x=><div key={x} className="h-28 rounded-2xl bg-slate-100"/>)}</div></div></div>;
  if (!product) return <div className="p-8 text-center" dir={en ? "ltr" : "rtl"}><Package className="mx-auto h-12 w-12 text-slate-300"/><h2 className="mt-3 text-xl font-bold">{t("المنتج غير موجود أو لا تملك صلاحية عرضه","Product not found or you don't have permission to view it")}</h2><Link className="mt-5 inline-flex rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white" to="/inventory">{t("العودة للمنتجات","Back to products")}</Link></div>;

  const priceValues = [product.salePrice, ...variants.map(v => v.salePrice)].filter(v => v !== null && v !== undefined).map(Number);
  const priceRange = priceValues.length ? (Math.min(...priceValues) === Math.max(...priceValues) ? money(priceValues[0], en) : money(Math.min(...priceValues), en) + " – " + money(Math.max(...priceValues), en)) : "—";
  const tabs = [{ id: "overview", label: t("نظرة عامة","Overview"), icon: Package }, { id: "variants", label: t("المتغيرات","Variants") + " (" + variants.length + ")", icon: Layers3 }, { id: "stock", label: t("المخزون","Stock"), icon: Boxes }, { id: "technical", label: t("البيانات الفنية","Technical data"), icon: Barcode }];
  return <main className="erp-pro-page mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 xl:p-8" dir={en ? "ltr" : "rtl"}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><Link to="/inventory" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" title={t("العودة للمنتجات","Back to products")}><ArrowLeft className="h-5 w-5"/></Link><div><div className="flex flex-wrap items-center gap-2 text-xs text-slate-400"><Link to="/inventory" className="hover:text-indigo-700">{t("المنتجات والمخزون","Products & inventory")}</Link><span>/</span><span>{t("ملف المنتج","Product profile")}</span></div><h1 className="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">{product.name}</h1><p className="mt-1 text-sm text-slate-500">{product.brand || t("بدون علامة تجارية","No brand")} · SKU {product.sku || "—"}</p></div></div>
      <Link to="/inventory" className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700"><Pencil className="h-4 w-4"/>{t("تعديل من إدارة المنتجات","Edit in product management")}</Link>
    </div>

    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="grid lg:grid-cols-[minmax(250px,360px)_1fr]">
        <div className="flex min-h-[260px] items-center justify-center border-b border-slate-100 bg-gradient-to-br from-slate-50 to-indigo-50/50 p-6 lg:border-b-0 lg:border-e">
          {product.imageUrl && !imageFailed ? <img src={product.imageUrl} alt={product.name} className="max-h-[280px] w-full object-contain" onError={() => setImageFailed(true)}/> : <div className="flex flex-col items-center gap-3 text-slate-300"><ImageIcon className="h-16 w-16"/><span className="text-sm">{t("لا توجد صورة متاحة","No image available")}</span></div>}
        </div>
        <div className="space-y-5 p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${product.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{product.isActive ? t("منتج فعال","Active product") : t("منتج معطل","Inactive product")}</span>{product.hasIMEI && <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">IMEI</span>}{product.parentProduct && <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">{t("نسخة من","Variant of")} {product.parentProduct.name}</span>}</div>
          <div><p className="text-sm font-semibold text-slate-500">{t("سعر البيع","Sale price")}</p><p className="mt-1 text-3xl font-black text-indigo-700">{money(product.salePrice, en)} <span className="text-sm font-bold text-slate-400">{t("ج.م","EGP")}</span></p><p className="mt-1 text-sm text-slate-500">{variants.length ? t("نطاق أسعار المتغيرات: ","Variant price range: ") + priceRange : t("سعر التكلفة: ","Cost price: ") + money(product.costPrice, en)}</p></div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric label={t("إجمالي المتغيرات","Total variants")} value={variants.length} tone="indigo"/><Metric label={t("إجمالي المخزون المعروض","Stock shown")} value={totalStock} tone={totalStock ? "emerald" : "amber"}/><Metric label={t("حد تنبيه المخزون","Low-stock threshold")} value={product.lowStockQty ?? 5}/><Metric label={t("التصنيف","Category")} value={product.category?.name || "—"}/></div>
        </div>
      </div>
    </section>

    <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2">{tabs.map(tab => { const Icon=tab.icon; return <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${activeTab === tab.id ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}><Icon className="h-4 w-4"/>{tab.label}</button>; })}</nav>

    {activeTab === "overview" && <section className="grid gap-5 xl:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold"><Tag className="h-5 w-5 text-indigo-600"/>{t("بيانات المنتج الأساسية","Basic product information")}</h2><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Data label="SKU" value={product.sku} mono/><Data label={t("الباركود","Barcode")} value={product.barcode} mono/><Data label={t("العلامة التجارية","Brand")} value={product.brand}/><Data label={t("التصنيف","Category")} value={product.category?.name}/><Data label={t("سعر التكلفة","Cost price")} value={money(product.costPrice, en)}/><Data label={t("سعر البيع","Sale price")} value={money(product.salePrice, en)}/><Data label={t("تاريخ الإنشاء","Created")} value={dateText(product.createdAt, en)}/><Data label={t("آخر تحديث","Last updated")} value={dateText(product.updatedAt, en)}/></div>{product.description && <div className="mt-3 rounded-xl border border-slate-100 p-3"><p className="text-xs text-slate-500">{t("الوصف","Description")}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{product.description}</p></div>}</div><div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold"><ShieldCheck className="h-5 w-5 text-indigo-600"/>{t("إعدادات ومراقبة","Controls & monitoring")}</h2><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Data label={t("الحالة","Status")} value={product.isActive ? t("فعال","Active") : t("معطل","Inactive")}/><Data label={t("تتبع IMEI","IMEI tracking")} value={product.hasIMEI ? t("مفعل","Enabled") : t("غير مفعل","Disabled")}/><Data label={t("حد المخزون المنخفض","Low-stock limit")} value={product.lowStockQty ?? 5}/><Data label={t("عدد سجلات IMEI المتاحة","Available IMEI records")} value={product.imeiRecords?.length || 0}/></div>{product.parentProduct && <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50 p-3"><p className="text-xs font-semibold text-violet-700">{t("المنتج الأساسي","Parent product")}</p><p className="mt-1 font-bold">{product.parentProduct.name}</p><p className="mt-1 text-xs text-violet-700">SKU: {product.parentProduct.sku}</p></div>}</div></section>}

    {activeTab === "variants" && <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">{t("كل المتغيرات","All variants")}</h2><p className="mt-1 text-sm text-slate-500">{t("كل نسخة مع باركودها وسعرها وتكلفتها ومخزونها وصورتها وحالتها.","Every variant with its SKU, barcode, price, cost, stock, image and status.")}</p></div><span className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-bold text-indigo-700">{variants.length} {t("نسخة","variants")}</span></div>{variants.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><Layers3 className="mx-auto h-12 w-12 text-slate-300"/><h3 className="mt-3 font-bold">{t("لا توجد متغيرات لهذا المنتج","This product has no variants")}</h3><p className="mt-1 text-sm text-slate-500">{t("يمكنك إضافتها من إدارة المنتجات.","You can add them from product management.")}</p></div> : <div className="grid gap-4 xl:grid-cols-2">{variants.map(v => <article key={v.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex gap-4 border-b border-slate-100 p-4"><div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50">{(v.imageUrl || product.imageUrl) ? <img src={v.imageUrl || product.imageUrl} alt={v.variantLabel || v.name} className="h-full w-full object-contain" onError={e=>{e.currentTarget.style.display="none";}}/> : <Package className="h-9 w-9 text-slate-300"/>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold">{v.variantLabel || v.name}</h3><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${v.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{v.isActive ? t("فعال","Active") : t("معطل","Inactive")}</span></div><p className="mt-1 text-xs text-slate-500">{v.name}</p><p className="mt-2 font-mono text-xs text-slate-600">SKU: {v.sku || "—"} · {t("الباركود","Barcode")}: {v.barcode || "—"}</p><p className="mt-2 text-sm font-black text-indigo-700">{money(v.salePrice,en)} <span className="font-normal text-slate-400">{t("ج.م","EGP")}</span></p></div></div><div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3"><Data label={t("التكلفة","Cost")} value={money(v.costPrice,en)}/><Data label={t("حد التنبيه","Low-stock limit")} value={v.lowStockQty ?? 5}/><Data label={t("IMEI","IMEI")} value={v.hasIMEI ? t("نعم","Yes") : t("لا","No")}/></div><div className="px-4 pb-4"><h4 className="mb-2 text-xs font-bold text-slate-500">{t("المخزون حسب الفرع","Stock by branch")}</h4><StockTable inventory={v.inventory} en={en} t={t}/></div></article>)}</div>}</section>}

    {activeTab === "stock" && <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"><div><h2 className="text-xl font-black">{t("أرصدة المخزون حسب الفرع","Stock by branch")}</h2><p className="mt-1 text-sm text-slate-500">{t("الأرصدة المعروضة وفق صلاحيات حسابك.","Stock shown according to your account permissions.")}</p></div><StockTable inventory={product.inventory} en={en} t={t}/>{variants.length > 0 && variants.map(v=><div key={v.id}><h3 className="mb-2 font-bold">{v.variantLabel || v.name} · SKU {v.sku}</h3><StockTable inventory={v.inventory} en={en} t={t}/></div>)}</section>}

    {activeTab === "technical" && <section className="grid gap-4 xl:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold"><Barcode className="h-5 w-5 text-indigo-600"/>{t("المعرفات","Identifiers")}</h2><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Data label="Product ID" value={product.id} mono/><Data label="SKU" value={product.sku} mono/><Data label={t("الباركود","Barcode")} value={product.barcode} mono/><Data label={t("المنتج الأساسي ID","Parent product ID")} value={product.parentProductId} mono/></div></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold"><Smartphone className="h-5 w-5 text-indigo-600"/>{t("أرقام IMEI المتاحة","Available IMEI numbers")}</h2>{product.imeiRecords?.length ? <div className="space-y-2">{product.imeiRecords.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3"><span className="font-mono text-sm font-bold">{item.imei}</span><span className="text-xs text-slate-500">{item.color || "—"} · {item.storage || "—"}</span></div>)}</div> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{t("لا توجد أرقام IMEI متاحة مسجلة.","No available IMEI numbers recorded.")}</p>}</div></section>}
  </main>;
}
