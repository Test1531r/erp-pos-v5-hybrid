import { useEffect, useMemo, useState } from "react";
import { api, useStore } from "../store/index.js";
import toast from "react-hot-toast";
import { RotateCcw, Search, X, Receipt, CheckCircle2, Printer, FileText, Package, AlertCircle, Wallet, History, ArrowUpRight, LoaderCircle } from "lucide-react";

const money = (value) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateText = (value, en) => value ? new Date(value).toLocaleString(en ? "en-US" : "ar-EG") : "—";

function ReceiptModal({ record, onClose, en, userName }) {
  if (!record) return null;
  const t = (ar, english) => en ? english : ar;
  const items = record.items || [];
  return <div className="fixed inset-0 z-[80] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5" onClick={onClose}>
    <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 print:hidden">
        <div className="flex items-center gap-2"><div className="rounded-xl bg-rose-50 p-2 text-rose-600"><Receipt className="h-5 w-5"/></div><div><h3 className="font-bold text-slate-900">{t("فاتورة مرتجع","Return receipt")}</h3><p className="text-xs text-slate-500">{record.returnNumber || "—"}</p></div></div>
        <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5"/></button>
      </div>
      <div className="return-receipt-print px-6 py-5 text-sm text-slate-800">
        <div className="text-center border-b border-dashed border-slate-300 pb-3">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 print:hidden"><RotateCcw className="h-5 w-5"/></div>
          <h2 className="text-xl font-black">{t("إيصال مرتجع","RETURN RECEIPT")}</h2>
          <p className="mt-1 font-mono text-sm font-bold">{record.returnNumber || "—"}</p>
          <p className="mt-1 text-xs text-slate-500">{dateText(record.createdAt, en)}</p>
        </div>
        <div className="space-y-2 border-b border-dashed border-slate-300 py-3">
          <div className="flex justify-between gap-3"><span className="text-slate-500">{t("رقم الفاتورة الأصلية","Original invoice")}</span><b className="text-left font-mono">{record.invoice?.invoiceNumber || record.invoiceNumber || "—"}</b></div>
          <div className="flex justify-between gap-3"><span className="text-slate-500">{t("حساب رد المبلغ","Refund account")}</span><b className="text-left">{record.refundAccount?.name || "—"}</b></div>
          <div className="flex justify-between gap-3"><span className="text-slate-500">{t("الموظف","Processed by")}</span><b className="text-left">{record.user?.name || userName || "—"}</b></div>
        </div>
        <div className="py-3">
          <h3 className="mb-2 font-bold">{t("الأصناف المرتجعة","Returned items")}</h3>
          {items.length ? <div className="space-y-2">{items.map((item, index) => <div key={item.id || index} className="border-b border-dashed border-slate-200 pb-2">
            <div className="font-semibold">{item.product?.name || item.productName || t("صنف مرتجع","Returned item")}</div>
            {item.product?.sku && <div className="text-xs text-slate-500">{t("كود الصنف","SKU")}: {item.product.sku}</div>}
            <div className="mt-1 flex justify-between gap-3 text-xs"><span>{t("الكمية","Qty")}: {item.quantity} × {money(item.unitRefund)}</span><b>{money(item.lineRefund)}</b></div>
            {Array.isArray(item.imeiNumbers) && item.imeiNumbers.length > 0 && <div className="mt-1 break-all text-[10px] text-slate-500">IMEI: {item.imeiNumbers.join(", ")}</div>}
          </div>)}</div> : <p className="text-slate-500">{t("تفاصيل الأصناف غير متاحة","Item details unavailable")}</p>}
        </div>
        <div className="border-y-2 border-double border-slate-400 py-3">
          <div className="flex justify-between items-center gap-3"><span className="font-bold">{t("إجمالي المبلغ المرتجع","Total refund")}</span><strong className="text-xl font-black text-rose-700">{money(record.total)} <span className="text-xs">{t("ج.م","EGP")}</span></strong></div>
        </div>
        <div className="space-y-1 pt-3 text-xs">
          <div className="flex justify-between gap-3"><span className="text-slate-500">{t("سبب المرتجع","Return reason")}</span><span className="text-left">{record.reason || "—"}</span></div>
          <p className="pt-2 text-center text-slate-500">{t("إيصال داخلي لإثبات عملية المرتجع","Internal receipt confirming the return")}</p>
        </div>
      </div>
      <div className="flex gap-2 border-t border-slate-100 bg-slate-50 p-4 print:hidden">
        <button onClick={() => window.print()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-bold text-white hover:bg-slate-800"><Printer className="h-4 w-4"/>{t("طباعة فاتورة المرتجع","Print return receipt")}</button>
        <button onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700">{t("إغلاق","Close")}</button>
      </div>
    </div>
  </div>;
}

export default function Returns() {
  const language = useStore(s => s.language);
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;
  const { activeBranch, user } = useStore();
  const [rows, setRows] = useState([]);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoice, setInvoice] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [refundAccountId, setRefundAccountId] = useState("");
  const [reason, setReason] = useState("");
  const [qty, setQty] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [receipt, setReceipt] = useState(null);

  const load = async () => {
    try {
      const [r, a] = await Promise.all([api.get("/returns"), api.get("/finance/accounts")]);
      setRows(Array.isArray(r.data) ? r.data : []);
      setAccounts(Array.isArray(a.data) ? a.data.filter(x => x.isActive !== false) : []);
    } catch (e) {
      toast.error(e.response?.data?.error || t("تعذر تحميل بيانات المرتجعات","Could not load returns"));
    }
  };
  useEffect(() => { if (activeBranch?.id) load(); }, [activeBranch?.id]);

  const searchInvoice = async () => {
    if (!invoiceNo.trim()) { toast.error(t("اكتب رقم الفاتورة أولاً","Enter an invoice number first")); return; }
    setLoading(true);
    try {
      const { data: list } = await api.get(`/invoices?search=${encodeURIComponent(invoiceNo.trim())}`);
      const invoices = Array.isArray(list) ? list : (list.invoices || list.data || []);
      const found = invoices.find(x => x.invoiceNumber === invoiceNo.trim()) || invoices[0];
      if (!found) throw new Error("NOT_FOUND");
      const { data } = await api.get(`/returns/invoice/${found.id}/available`);
      setInvoice(data);
      setQty(Object.fromEntries((data.items || []).map(i => [i.id, 0])));
      setRefundAccountId(data.paymentSplits?.[0]?.accountId || accounts.find(a => a.type === "CASHBOX")?.id || accounts[0]?.id || "");
      setReason("");
    } catch (e) {
      toast.error(e.response?.data?.error || t("لم يتم العثور على الفاتورة أو لا يمكن إرجاعها","Invoice not found or unavailable for return"));
      setInvoice(null);
    } finally { setLoading(false); }
  };

  const selectedItems = useMemo(() => (invoice?.items || []).filter(i => Number(qty[i.id] || 0) > 0).map(i => {
    const quantity = Number(qty[i.id] || 0);
    const subtotal = Number(invoice.subtotal || 0);
    const ratio = subtotal > 0 ? Number(invoice.total || 0) / subtotal : 1;
    return { ...i, returnQty: quantity, lineRefund: (Number(i.lineTotal || 0) / Math.max(1, Number(i.quantity || 1))) * quantity * ratio };
  }), [invoice, qty]);
  const estimate = selectedItems.reduce((sum, i) => sum + i.lineRefund, 0);
  const availableCount = (invoice?.items || []).reduce((sum, i) => sum + Math.max(0, Number(i.availableQty || 0)), 0);
  const filteredRows = rows.filter(r => [r.returnNumber, r.invoice?.invoiceNumber, r.refundAccount?.name, r.user?.name, r.reason].some(v => String(v || "").toLowerCase().includes(historySearch.trim().toLowerCase())));
  const totalReturned = rows.reduce((sum, r) => sum + Number(r.total || 0), 0);

  const submit = async () => {
    if (!invoice) return;
    const items = selectedItems.map(i => ({ invoiceItemId: i.id, quantity: i.returnQty, imeiNumbers: i.imeiNumbers?.length ? i.imeiNumbers.slice(0, i.returnQty) : [] }));
    if (!items.length) { toast.error(t("حدد كمية مرتجعة لصنف واحد على الأقل","Select a return quantity")); return; }
    if (!refundAccountId) { toast.error(t("حدد حساب رد المبلغ","Select a refund account")); return; }
    setSaving(true);
    try {
      const { data: created } = await api.post("/returns", { invoiceId: invoice.id, items, refundAccountId, reason });
      toast.success(t("تم تنفيذ المرتجع بنجاح","Return processed successfully"));
      setReceipt(created);
      setInvoice(null); setInvoiceNo(""); setQty({}); setReason("");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.error || t("فشل تنفيذ المرتجع","Failed to process return"));
    } finally { setSaving(false); }
  };

  return <div className="erp-pro-page returns-page h-full overflow-y-auto p-4 sm:p-6 lg:p-8" dir={en ? "ltr" : "rtl"}>
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700"><RotateCcw className="h-3.5 w-3.5"/>{t("إدارة المرتجعات","Returns management")}</div><h1 className="text-3xl font-black text-slate-900">{t("المرتجعات","Returns")}</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">{t("إدارة المرتجع الجزئي أو الكامل، واسترداد المبلغ ومتابعة سجل المرتجعات وطباعة إيصال واضح لكل عملية.","Process partial or full returns, refund the customer, track return history and print a receipt for every return.")}</p></div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm"><History className="h-4 w-4 text-indigo-600"/><span>{t("عمليات هذا الفرع","Branch returns")}</span><b className="text-slate-900">{rows.length}</b></div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-500">{t("عدد عمليات المرتجع","Return operations")}</span><span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600"><RotateCcw className="h-5 w-5"/></span></div><p className="mt-3 text-3xl font-black text-slate-900">{rows.length}</p><p className="mt-1 text-xs text-slate-400">{t("آخر 150 عملية محملة","Latest 150 records loaded")}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-500">{t("إجمالي المبالغ المرتجعة","Total refunded")}</span><span className="rounded-xl bg-rose-50 p-2.5 text-rose-600"><Wallet className="h-5 w-5"/></span></div><p className="mt-3 text-3xl font-black text-rose-700">{money(totalReturned)} <span className="text-sm">{t("ج.م","EGP")}</span></p><p className="mt-1 text-xs text-slate-400">{t("حسب السجل الظاهر","Based on loaded history")}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-500">{t("حسابات رد المبالغ","Refund accounts")}</span><span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600"><CheckCircle2 className="h-5 w-5"/></span></div><p className="mt-3 text-3xl font-black text-slate-900">{accounts.length}</p><p className="mt-1 text-xs text-slate-400">{t("الحسابات النشطة المتاحة","Active accounts available")}</p></div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className="rounded-xl bg-indigo-50 p-3 text-indigo-600"><Search className="h-5 w-5"/></div><div><h2 className="font-bold text-slate-900">{t("إنشاء مرتجع جديد","Create a return")}</h2><p className="mt-1 text-sm text-slate-500">{t("ابحث برقم الفاتورة الأصلية، ثم اختر الكميات المراد إرجاعها.","Search the original invoice, then select quantities to return.")}</p></div></div><div className="text-xs text-slate-400">{t("يتم تحديث المخزون والحساب المالي بعد اعتماد العملية","Inventory and account balance update when processed")}</div></div>
        <div className="flex flex-col gap-3 p-5 sm:flex-row"><div className="relative flex-1"><Search className={`absolute top-3.5 h-4 w-4 text-slate-400 ${en ? "left-3" : "right-3"}`}/><input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} onKeyDown={e => e.key === "Enter" && searchInvoice()} className={`w-full rounded-xl border border-slate-200 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 ${en ? "pl-10 pr-4" : "pr-10 pl-4"}`} placeholder={t("رقم الفاتورة الأصلية...","Original invoice number...")}/></div><button onClick={searchInvoice} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60">{loading ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Search className="h-4 w-4"/>}{t("بحث عن الفاتورة","Find invoice")}</button></div>
        {invoice && <div className="border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-indigo-100 bg-white p-4"><div><p className="text-xs font-semibold text-slate-500">{t("الفاتورة الأصلية","Original invoice")}</p><h3 className="mt-1 font-mono text-lg font-black text-slate-900">{invoice.invoiceNumber}</h3><p className="mt-1 text-xs text-slate-500">{t("إجمالي الفاتورة","Invoice total")}: {money(invoice.total)} {t("ج.م","EGP")} · {t("كمية متاحة للمرتجع","Available qty")}: {availableCount}</p></div><button onClick={() => setInvoice(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5"/></button></div>
          <div className="space-y-3">{(invoice.items || []).map(item => { const chosen = Number(qty[item.id] || 0); const canReturn = Number(item.availableQty || 0) > 0; return <div key={item.id} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_100px_130px] sm:items-center">
            <div className="min-w-0"><p className="font-bold text-slate-900">{item.productName}</p><p className="mt-1 text-xs text-slate-500">{t("مباع","Sold")}: {item.quantity} · {t("مرتجع سابق","Returned")}: {item.returnedQty} · {t("متاح","Available")}: <b className={canReturn ? "text-emerald-700" : "text-rose-600"}>{item.availableQty}</b></p>{item.imeiNumbers?.length > 0 && <p className="mt-2 break-all text-[11px] text-slate-400">IMEI: {item.imeiNumbers.join(", ")}</p>}</div>
            <div className="text-sm"><span className="text-slate-500">{t("قيمة تقديرية","Est. refund")}</span><p className="font-bold text-slate-900">{money((Number(item.lineTotal || 0) / Math.max(1, Number(item.quantity || 1))) * chosen)} {t("ج.م","EGP")}</p></div>
            <div><label className="mb-1 block text-xs font-semibold text-slate-500">{t("كمية المرتجع","Return qty")}</label><input type="number" min="0" max={item.availableQty} disabled={!canReturn} value={chosen} onChange={e => setQty(old => ({...old, [item.id]: Math.min(Number(item.availableQty || 0), Math.max(0, Number(e.target.value || 0)))}))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-center font-bold outline-none focus:border-indigo-400 disabled:bg-slate-100"/></div>
          </div>; })}</div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{t("حساب رد المبلغ","Refund account")} *</span><select value={refundAccountId} onChange={e => setRefundAccountId(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-indigo-400"><option value="">{t("اختر الحساب","Select account")}</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {money(a.balance)} {t("ج.م","EGP")}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{t("سبب المرتجع","Return reason")}</span><input value={reason} onChange={e => setReason(e.target.value)} maxLength={300} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-indigo-400" placeholder={t("مثال: عيب في المنتج أو استبدال","e.g. defective product or exchange")}/></label></div>
          <div className="mt-4 flex flex-col gap-4 rounded-xl border border-rose-100 bg-rose-50/70 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold text-rose-700">{t("إجمالي المبلغ المتوقع رده","Estimated refund total")}</p><p className="mt-1 text-2xl font-black text-rose-800">{money(estimate)} <span className="text-sm">{t("ج.م","EGP")}</span></p><p className="mt-1 text-xs text-rose-600"><AlertCircle className="mr-1 inline h-3.5 w-3.5"/>{t("يتم حساب القيمة النهائية من الخادم عند اعتماد المرتجع","Final amount is calculated by the server when processed")}</p></div><button onClick={submit} disabled={saving || !selectedItems.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-6 py-3 font-bold text-white shadow-sm hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <RotateCcw className="h-4 w-4"/>}{saving ? t("جارٍ تنفيذ المرتجع...","Processing return...") : t("اعتماد المرتجع وطباعة الإيصال","Process return & receipt")}</button></div>
        </div>}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><History className="h-5 w-5 text-indigo-600"/><h2 className="font-bold text-slate-900">{t("سجل المرتجعات","Return history")}</h2></div><p className="mt-1 text-sm text-slate-500">{t("راجع تفاصيل كل مرتجع وأعد طباعة الإيصال عند الحاجة.","Review return details and reprint receipts when needed.")}</p></div><div className="relative w-full sm:max-w-xs"><Search className={`absolute top-3 h-4 w-4 text-slate-400 ${en ? "left-3" : "right-3"}`}/><input value={historySearch} onChange={e => setHistorySearch(e.target.value)} className={`w-full rounded-xl border border-slate-200 py-2.5 text-sm ${en ? "pl-9 pr-3" : "pr-9 pl-3"}`} placeholder={t("بحث في سجل المرتجعات","Search return history")}/></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className={`px-4 py-3 font-semibold ${en ? "text-left" : "text-right"}`}>{t("رقم المرتجع","Return number")}</th><th className={`px-4 py-3 font-semibold ${en ? "text-left" : "text-right"}`}>{t("الفاتورة الأصلية","Original invoice")}</th><th className={`px-4 py-3 font-semibold ${en ? "text-left" : "text-right"}`}>{t("حساب الرد","Refund account")}</th><th className={`px-4 py-3 font-semibold ${en ? "text-left" : "text-right"}`}>{t("الموظف","Processed by")}</th><th className={`px-4 py-3 font-semibold ${en ? "text-left" : "text-right"}`}>{t("التاريخ","Date")}</th><th className="px-4 py-3 text-left font-semibold">{t("المبلغ","Amount")}</th><th className="px-4 py-3 text-center font-semibold">{t("الإيصال","Receipt")}</th></tr></thead><tbody>{filteredRows.map(r => <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/70"><td className="px-4 py-3.5 font-mono font-bold text-slate-800">{r.returnNumber}</td><td className="px-4 py-3.5 font-mono text-slate-600">{r.invoice?.invoiceNumber || "—"}</td><td className="px-4 py-3.5">{r.refundAccount?.name || "—"}</td><td className="px-4 py-3.5">{r.user?.name || "—"}</td><td className="px-4 py-3.5 text-xs text-slate-500">{dateText(r.createdAt, en)}</td><td className="px-4 py-3.5 text-left font-black text-rose-700">-{money(r.total)}</td><td className="px-4 py-3.5 text-center"><button onClick={() => setReceipt(r)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"><FileText className="h-4 w-4"/>{t("عرض الفاتورة","View receipt")}</button></td></tr>)}{!filteredRows.length && <tr><td colSpan="7" className="p-12 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><Receipt className="h-6 w-6"/></div><p className="font-semibold text-slate-700">{t("لا توجد عمليات مرتجع مطابقة","No matching returns")}</p><p className="mt-1 text-sm text-slate-400">{t("ابدأ بالبحث عن فاتورة لإنشاء مرتجع جديد.","Search for an invoice to create a new return.")}</p></td></tr>}</tbody></table></div>
      </section>
    </div>
    <ReceiptModal record={receipt} onClose={() => setReceipt(null)} en={en} userName={user?.name}/>
  </div>;
}
