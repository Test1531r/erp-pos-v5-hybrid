import { useState, useEffect } from "react";
import { useStore, api } from "../store/index.js";
import { Plus, Search, Edit2, X, Check, Package, RefreshCw, AlertTriangle, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import { useDialog } from "../components/InteractionProvider.jsx";

// ── SHARED MODAL ────────────────────────────────────────────
function Modal({ title, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
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

// ══════════════════════════════════════════════════════════════
// INVENTORY
// ══════════════════════════════════════════════════════════════
export function Inventory() {
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

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/products?limit=100&branchId=${activeBranch?.id || ""}&search=${search}`);
      setProducts(data.products);
    } catch { toast.error("فشل تحميل المنتجات"); }
    setLoading(false);
  };

  useEffect(() => { load(); fetchCategories(); }, [search, activeBranch?.id]);
  const inventorySummary = products.reduce((summary, product) => {
    const quantity = product.inventory?.[0]?.quantity ?? 0;
    if (product.isActive !== false && quantity <= Number(product.lowStockQty ?? 5)) {
      summary.lowStock += 1;
      if (quantity === 0) summary.outOfStock += 1;
    }
    return summary;
  }, { lowStock: 0, outOfStock: 0 });
  const visibleProducts = products.filter((product) => {
    const quantity = product.inventory?.[0]?.quantity ?? 0;
    return stockFilter === "all" || (product.isActive !== false && (stockFilter === "out" ? quantity === 0 : quantity <= Number(product.lowStockQty ?? 5)));
  });

  const openAdd = () => { setForm({ salePrice: 0, costPrice: 0, lowStockQty: 5, hasIMEI: false, isActive: true }); setModal("add"); };
  const openEdit = (p) => { setSelected(p); setForm({ ...p }); setModal("edit"); };
  const openAdjust = (p) => { setSelected(p); setAdjustForm({ type: "ADD", quantity: 1, reason: "" }); setModal("adjust"); };
  const openIMEI = (p) => { setSelected(p); setImeiList([{ imei: "", color: "", storage: "" }]); setModal("imei"); };

  const handleSave = async () => {
    try {
      if (modal === "add") await api.post("/products", form);
      else await api.put(`/products/${selected.id}`, form);
      toast.success("تم الحفظ");
      setModal(null);
      load();
    } catch (err) { toast.error(err.response?.data?.error || "فشل الحفظ"); }
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
    <div className="p-6" dir={en ? "ltr" : "rtl"}>
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

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="p-4 border-b flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث..." className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pr-9 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <button onClick={load} className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50"><RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? "animate-spin" : ""}`} /></button>
        </div>

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
                const qty = p.inventory?.[0]?.quantity ?? 0;
                const lowStock = qty <= p.lowStockQty;
                return (
                  <tr key={p.id} className="border-b hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-slate-800">{p.name}</p>
                        {p.brand && <p className="text-xs text-slate-400">{p.brand}</p>}
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
      </div>

      {/* Add/Edit Modal */}
      {(modal === "add" || modal === "edit") && (
        <Modal title={modal === "add" ? "إضافة منتج جديد" : "تعديل المنتج"} onClose={() => setModal(null)} footer={<><Btn variant="secondary" onClick={() => setModal(null)}>{t("إلغاء", "Cancel")}</Btn><Btn onClick={handleSave}>{t("حفظ", "Save")}</Btn></>}>
          <div className="space-y-3">
            <Field label="اسم المنتج *"><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="اسم المنتج" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="SKU *"><Input value={form.sku || ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="SKU-001" /></Field>
              <Field label="باركود"><Input value={form.barcode || ""} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="1234567890" /></Field>
            </div>
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
            <div className="grid grid-cols-2 gap-3">
              <Field label="حد المخزون المنخفض"><Input type="number" value={form.lowStockQty || 5} onChange={(e) => setForm({ ...form, lowStockQty: parseInt(e.target.value) })} /></Field>
              <Field label="رابط الصورة"><Input value={form.imageUrl || ""} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://..." /></Field>
            </div>
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
        <html lang="ar" dir={en ? "ltr" : "rtl"}>
          <head>
            <meta charset="UTF-8" />
            <title>${esc(inv.invoiceNumber)}</title>
            <style>
              @page { size: 80mm auto; margin: 4mm; }
              * { box-sizing: border-box; }
              body {
                font-family: Arial, Tahoma, sans-serif;
                width: 72mm;
                margin: 0 auto;
                color: #000;
                background: #fff;
                font-size: 12px;
                line-height: 1.5;
              }
              .center { text-align: center; }
              .bold { font-weight: 700; }
              .row { display: flex; justify-content: space-between; gap: 8px; }
              .sep { border-top: 1px dashed #000; margin: 7px 0; }
              .item { margin: 5px 0; }
              .item-name { font-weight: 700; margin-bottom: 2px; }
              .small { font-size: 10px; word-break: break-all; }
              h2 { margin: 0 0 4px; font-size: 18px; }
              p { margin: 2px 0; }
              .total { font-size: 15px; font-weight: 700; }
            </style>
          </head>
          <body>
            <div class="center">
              <h2>${esc(inv.branch?.name || "ERP POS")}</h2>
              ${inv.branch?.address ? `<p>${esc(inv.branch.address)}</p>` : ""}
              ${inv.branch?.phone ? `<p>${esc(inv.branch.phone)}</p>` : ""}
              ${inv.branch?.taxNumber ? `<p>الرقم الضريبي: ${esc(inv.branch.taxNumber)}</p>` : ""}
              <div class="sep"></div>
              <p class="bold">{t("فاتورة مبيعات", "Sales invoice")}</p>
              <p>${esc(inv.invoiceNumber)}</p>
              <p>${new Date(inv.createdAt).toLocaleString("ar-EG")}</p>
            </div>

            <div class="sep"></div>
            <p>العميل: ${esc(inv.customer?.name || "عميل عادي")}</p>
            <p>الكاشير: ${esc(inv.cashier?.name || "-")}</p>
            <div class="sep"></div>

            ${itemsHtml}

            <div class="row">
              <span>{t("المجموع الفرعي", "Subtotal")}</span>
              <span>${money(inv.subtotal)} ج</span>
            </div>

            ${
              Number(inv.discountAmount) > 0
                ? `<div class="row"><span>{t("الخصم", "Discount")}</span><span>-${money(inv.discountAmount)} ج</span></div>`
                : ""
            }

            ${
              Number(inv.taxAmount) > 0
                ? `<div class="row"><span>{t("الضريبة", "Tax")}</span><span>${money(inv.taxAmount)} ج</span></div>`
                : ""
            }

            <div class="sep"></div>
            <div class="row total">
              <span>{t("الإجمالي", "Total")}</span>
              <span>${money(inv.total)} ج</span>
            </div>
            <div class="row">
              <span>{t("المدفوع", "Paid")}</span>
              <span>${money(inv.amountPaid)} ج</span>
            </div>

            ${
              Number(inv.changeGiven) > 0
                ? `<div class="row"><span>{t("الباقي", "Change due")}</span><span>${money(inv.changeGiven)} ج</span></div>`
                : ""
            }

            <div class="sep"></div>
            <p>طريقة الدفع: ${paymentText}</p>
            ${inv.notes ? `<p>ملاحظات: ${esc(inv.notes)}</p>` : ""}
            <div class="sep"></div>

            <div class="center">
              <p>{t("شكراً لتعاملكم معنا", "Thank you for your business")}</p>
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
    <div className="p-6" dir={en ? "ltr" : "rtl"}>
      <h2 className="text-2xl font-bold text-slate-800 mb-6">{t("سجل المبيعات", "Sales history")}</h2>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="p-4 border-b flex gap-3 flex-wrap">
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setPage(1);
              setFrom(e.target.value);
            }}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <span className="text-slate-400 self-center">إلى</span>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setPage(1);
              setTo(e.target.value);
            }}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            onClick={load}
            className="border border-slate-200 px-4 py-2 rounded-xl text-sm hover:bg-slate-50"
          >
            بحث
          </button>
          <span className="mr-auto text-sm text-slate-500 self-center">{total} فاتورة</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-right text-slate-500 text-xs">
                <th className="px-4 py-3 font-semibold">{t("رقم الفاتورة", "Invoice number")}</th>
                <th className="px-4 py-3 font-semibold">{t("العميل", "Customer")}</th>
                <th className="px-4 py-3 font-semibold">{t("الكاشير", "Cashier")}</th>
                <th className="px-4 py-3 font-semibold">{t("طريقة الدفع", "Payment method")}</th>
                <th className="px-4 py-3 font-semibold">{t("الإجمالي", "Total")}</th>
                <th className="px-4 py-3 font-semibold">{t("التاريخ", "Date")}</th>
                <th className="px-4 py-3 font-semibold">{t("إجراءات", "Actions")}</th>
              </tr>
            </thead>

            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-indigo-600 font-semibold">
                    {inv.invoiceNumber}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {inv.customer?.name || "عميل عادي"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{inv.cashier?.name}</td>
                  <td className="px-4 py-3">
                    <Badge color="blue">{PM_AR[inv.paymentMethod] || inv.paymentMethod}</Badge>
                  </td>
                  <td className="px-4 py-3 font-bold text-green-600">
                    {parseFloat(inv.total).toLocaleString()} ج
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {new Date(inv.createdAt).toLocaleString("ar-EG")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      <button
                        onClick={() => setSelected(inv)}
                        className="text-indigo-600 hover:bg-indigo-50 px-2 py-1.5 rounded-lg text-xs font-medium"
                      >
                        عرض
                      </button>
                      <button
                        onClick={() => handlePrint(inv.id)}
                        className="text-blue-600 hover:bg-blue-50 px-2 py-1.5 rounded-lg text-xs font-medium"
                        title="طباعة الفاتورة"
                      >
                        🖨 طباعة
                      </button>
                      <button
                        onClick={() => handleDelete(inv)}
                        className="text-red-600 hover:bg-red-50 px-2 py-1.5 rounded-lg text-xs font-medium"
                        title="حذف الفاتورة"
                      >
                        🗑 حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {invoices.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    لا توجد فواتير
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {total > 20 && (
          <div className="p-4 flex justify-center gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-slate-50"
            >
              السابق
            </button>
            <span className="text-sm text-slate-500 self-center">صفحة {page}</span>
            <button
              disabled={page * 20 >= total}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-slate-50"
            >
              التالي
            </button>
          </div>
        )}
      </div>

      {selected && (
        <Modal
          title={`فاتورة: ${selected.invoiceNumber}`}
          onClose={() => setSelected(null)}
          footer={
            <>
              <Btn variant="secondary" onClick={() => setSelected(null)}>
                إغلاق
              </Btn>
              <Btn onClick={() => handlePrint(selected.id)}>🖨 طباعة</Btn>
              <Btn variant="danger" onClick={() => handleDelete(selected)}>
                🗑 حذف
              </Btn>
            </>
          }
        >
          <InvoiceDetail id={selected.id} />
        </Modal>
      )}
    </div>
  );
}

function InvoiceDetail({ id }) {
  const [inv, setInv] = useState(null);

  useEffect(() => {
    api
      .get(`/invoices/${id}`)
      .then(({ data }) => setInv(data))
      .catch(() => toast.error("فشل التحميل"));
  }, [id]);

  if (!inv) {
    return <div className="text-center py-8 text-slate-400">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-slate-500 text-xs">{t("الكاشير", "Cashier")}</p>
          <p className="font-semibold">{inv.cashier?.name}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-slate-500 text-xs">{t("العميل", "Customer")}</p>
          <p className="font-semibold">{inv.customer?.name || "عميل عادي"}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-slate-500 text-xs">{t("طريقة الدفع", "Payment method")}</p>
          <p className="font-semibold">{inv.paymentMethod}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-3">
          <p className="text-slate-500 text-xs">{t("الإجمالي", "Total")}</p>
          <p className="font-bold text-lg text-green-600">
            {parseFloat(inv.total).toFixed(2)} ج
          </p>
        </div>
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-slate-500">
            <th className="text-right py-2">المنتج</th>
            <th className="text-center py-2">كمية</th>
            <th className="text-right py-2">سعر</th>
            <th className="text-right py-2">إجمالي</th>
          </tr>
        </thead>
        <tbody>
          {inv.items?.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="py-2">
                {item.productName}
                {item.imeiNumbers?.length > 0 && (
                  <p className="text-slate-400 font-mono">
                    {item.imeiNumbers.join(", ")}
                  </p>
                )}
              </td>
              <td className="py-2 text-center">{item.quantity}</td>
              <td className="py-2">{parseFloat(item.unitPrice).toFixed(2)}</td>
              <td className="py-2 font-semibold">
                {parseFloat(item.lineTotal).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="space-y-1 text-sm border-t pt-3">
        <div className="flex justify-between text-slate-600">
          <span>مجموع فرعي</span>
          <span>{parseFloat(inv.subtotal).toFixed(2)}</span>
        </div>
        {parseFloat(inv.discountAmount) > 0 && (
          <div className="flex justify-between text-green-600">
            <span>خصم</span>
            <span>-{parseFloat(inv.discountAmount).toFixed(2)}</span>
          </div>
        )}
        {parseFloat(inv.taxAmount) > 0 && (
          <div className="flex justify-between">
            <span>ضريبة</span>
            <span>{parseFloat(inv.taxAmount).toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base border-t pt-2">
          <span>{t("الإجمالي", "Total")}</span>
          <span className="text-indigo-600">{parseFloat(inv.total).toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>{t("المدفوع", "Paid")}</span>
          <span>{parseFloat(inv.amountPaid).toFixed(2)}</span>
        </div>
        {parseFloat(inv.changeGiven) > 0 && (
          <div className="flex justify-between text-green-600 font-semibold">
            <span>{t("الباقي", "Change due")}</span>
            <span>{parseFloat(inv.changeGiven).toFixed(2)}</span>
          </div>
        )}
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
  const [form, setForm] = useState({});

  const load = async () => {
    const { data } = await api.get(`/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`).catch(() => ({ data: [] }));
    setCustomers(data);
  };

  useEffect(() => { load(); }, [search]);

  const handleSave = async () => {
    try {
      if (modal === "add") await api.post("/customers", form);
      else await api.put(`/customers/${selected.id}`, form);
      toast.success("تم الحفظ"); setModal(null); load();
    } catch (err) { toast.error(err.response?.data?.error || "فشل الحفظ"); }
  };

  return (
    <div className="p-6" dir={en ? "ltr" : "rtl"}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">{t("العملاء", "Customers")}</h2>
        <Btn onClick={() => { setForm({}); setModal("add"); }}><Plus className="w-4 h-4" /> عميل جديد</Btn>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="p-4 border-b">
          <div className="relative max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث..." className="w-full bg-slate-50 border rounded-xl py-2 pr-9 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-slate-50 text-right text-slate-500 text-xs">
              <th className="px-4 py-3 font-semibold">{t("الاسم", "Name")}</th><th className="px-4 py-3 font-semibold">{t("الهاتف", "Phone")}</th><th className="px-4 py-3 font-semibold">{t("المدينة", "City")}</th><th className="px-4 py-3 font-semibold">{t("إجمالي الشراء", "Total purchases")}</th><th className="px-4 py-3 font-semibold">{t("إجراءات", "Actions")}</th>
            </tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-800">{c.name}</td>
                  <td className="px-4 py-3 text-slate-600 font-mono">{c.phone || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{c.city || "—"}</td>
                  <td className="px-4 py-3 font-bold text-green-600">{parseFloat(c.totalSpent || 0).toLocaleString()} ج</td>
                  <td className="px-4 py-3"><button onClick={() => { setSelected(c); setForm({ ...c }); setModal("edit"); }} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"><Edit2 className="w-4 h-4" /></button></td>
                </tr>
              ))}
              {customers.length === 0 && <tr><td colSpan={5} className="text-center py-12 text-slate-400">{t("لا يوجد عملاء", "No customers found")}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {modal && (
        <Modal title={modal === "add" ? "عميل جديد" : "تعديل العميل"} onClose={() => setModal(null)} footer={<><Btn variant="secondary" onClick={() => setModal(null)}>{t("إلغاء", "Cancel")}</Btn><Btn onClick={handleSave}>{t("حفظ", "Save")}</Btn></>}>
          <div className="space-y-3">
            <Field label="الاسم *"><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="رقم الهاتف"><Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="البريد الإلكتروني"><Input type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="العنوان"><Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label="المدينة"><Input value={form.city || ""} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="ملاحظات"><Input value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
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
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ role: "CASHIER", isActive: true });

  const load = async () => {
    const { data } = await api.get("/users").catch(() => ({ data: [] }));
    setUsers(data);
  };

  useEffect(() => { load(); fetchBranches(); }, []);

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
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">{t("إدارة المستخدمين", "User management")}</h2>
        <Btn onClick={() => { setForm({ role: "CASHIER", isActive: true, password: "", maxDiscountPct: 15 }); setModal("add"); }}><Plus className="w-4 h-4" /> مستخدم جديد</Btn>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-slate-50 text-right text-slate-500 text-xs">
            <th className="px-4 py-3 font-semibold">{t("المستخدم", "User")}</th><th className="px-4 py-3 font-semibold">{t("اسم المستخدم", "Username")}</th><th className="px-4 py-3 font-semibold">{t("الدور", "Role")}</th><th className="px-4 py-3 font-semibold">{t("الفرع", "Branch")}</th><th className="px-4 py-3 font-semibold">{t("الحالة", "Status")}</th><th className="px-4 py-3 font-semibold">{t("آخر دخول", "Last login")}</th><th className="px-4 py-3 font-semibold">{t("إجراءات", "Actions")}</th>
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
                <td className="px-4 py-3"><button onClick={() => { setSelected(u); setForm({ name: u.name, email: u.email, role: u.role, branchId: u.branchId, isActive: u.isActive, password: "", maxDiscountPct: u.maxDiscountPct ?? 15, permissions: u.permissions || {} }); setModal("edit"); }} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"><Edit2 className="w-4 h-4" /></button></td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-slate-400">{t("لا يوجد مستخدمون", "No users found")}</td></tr>}
          </tbody>
        </table>
      </div>
      {modal && (
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