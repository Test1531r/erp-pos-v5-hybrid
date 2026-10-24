import { useEffect, useState } from "react";
import { api, useStore } from "../store/index.js";
import toast from "react-hot-toast";
import { RotateCcw, Search, X, Receipt, CheckCircle2, Printer, FileText, PackageCheck } from "lucide-react";

const money = (value) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateText = (value, locale = "ar-EG") => value ? new Date(value).toLocaleString(locale) : "—";

export default function Returns() {
  const language = useStore(s => s.language);
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;
  const { activeBranch } = useStore();
  const [rows, setRows] = useState([]);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoice, setInvoice] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [refundAccountId, setRefundAccountId] = useState("");
  const [reason, setReason] = useState("");
  const [qty, setQty] = useState({});
  const [selectedImeis, setSelectedImeis] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastReturn, setLastReturn] = useState(null);
  const [printRequested, setPrintRequested] = useState(false);

  const load = async () => {
    const [returnsRes, accountsRes] = await Promise.all([api.get("/returns"), api.get("/finance/accounts")]);
    setRows(Array.isArray(returnsRes.data) ? returnsRes.data : []);
    setAccounts(Array.isArray(accountsRes.data) ? accountsRes.data : []);
  };
  useEffect(() => { if (activeBranch?.id) load().catch(() => toast.error(t("تعذر تحميل سجل المرتجعات", "Could not load returns"))); }, [activeBranch?.id]);
  useEffect(() => {
    if (!printRequested || !lastReturn) return;
    const timer = window.setTimeout(() => { window.print(); setPrintRequested(false); }, 120);
    return () => window.clearTimeout(timer);
  }, [printRequested, lastReturn]);

  const search = async () => {
    const searchValue = invoiceNo.trim();
    if (!searchValue || loading) return;
    setInvoice(null);
    setLoading(true);
    try {
      const { data: list } = await api.get(`/invoices?search=${encodeURIComponent(searchValue)}`);
      const invoiceList = Array.isArray(list) ? list : (list.invoices || list.data || []);
      const found = invoiceList.find(x => String(x.invoiceNumber || "").trim() === searchValue);
      if (!found) throw new Error("not-found");
      const { data } = await api.get(`/returns/invoice/${found.id}/available`);
      setInvoice(data);
      setQty(Object.fromEntries((data.items || []).map(item => [item.id, 0])));
      setSelectedImeis({});
      setRefundAccountId(data.paymentSplits?.[0]?.accountId || "");
      setReason("");
    } catch {
      toast.error(t("لم يتم العثور على الفاتورة بهذا الرقم بالضبط", "No exact invoice number match found"));
      setInvoice(null);
    } finally { setLoading(false); }
  };

  const submit = async () => {
    if (!invoice || submitting) return;
    const items = invoice.items.filter(item => Number(qty[item.id] || 0) > 0).map(item => ({
      invoiceItemId: item.id, quantity: Number(qty[item.id]), imeiNumbers: selectedImeis[item.id] || []
    }));
    if (!items.length) return toast.error(t("حدد كمية مرتجعة واحدة على الأقل", "Select at least one return quantity"));
    for (const item of items) {
      const source = invoice.items.find(x => x.id === item.invoiceItemId);
      if (source?.imeiNumbers?.length && item.imeiNumbers.length !== item.quantity)
        return toast.error(t("حدد أرقام IMEI بعدد الكمية المرتجعة لكل جهاز", "Select exactly one IMEI per returned device"));
    }
    if (!refundAccountId) return toast.error(t("اختر حساب رد المبلغ", "Choose a refund account"));
    setSubmitting(true);
    try {
      const { data: created } = await api.post("/returns", { invoiceId: invoice.id, items, refundAccountId, reason });
      setLastReturn(created);
      toast.success(t("تم تنفيذ المرتجع بنجاح", "Return processed successfully"));
      setInvoice(null);
      setInvoiceNo("");
      setQty({});
      setSelectedImeis({});
      await load();
    } catch (e) {
      toast.error(e.response?.data?.error || t("فشل تنفيذ المرتجع", "Return failed"));
    } finally { setSubmitting(false); }
  };

  const openReceipt = (item) => { setLastReturn(item); };
  const printReceipt = (item) => { setLastReturn(item); setPrintRequested(true); };
  const locale = en ? "en-US" : "ar-EG";
  const receiptItems = lastReturn?.items || [];

  return <div className="returns-page p-4 md:p-6 space-y-6" dir={en ? "ltr" : "rtl"}>
    <style>{`
      #return-receipt-print { display: none; box-sizing: border-box; width: 100%; max-width: 190mm; margin: 0 auto; }
      #return-receipt-print table { width: 100%; table-layout: fixed; }
      #return-receipt-print th, #return-receipt-print td { overflow-wrap: anywhere; vertical-align: top; }
      #return-receipt-print tr { break-inside: avoid; page-break-inside: avoid; }
      @media print {
        @page { size: A4 portrait; margin: 10mm; }
        html, body, #root { width: 100% !important; min-width: 0 !important; height: auto !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; background: #fff !important; }
        body * { visibility: hidden !important; }
        #return-receipt-print, #return-receipt-print * { visibility: visible !important; }
        #return-receipt-print { display: block !important; position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; width: 100% !important; max-width: none !important; height: auto !important; margin: 0 !important; padding: 0 !important; background: #fff !important; color: #111 !important; box-shadow: none !important; border: 0 !important; border-radius: 0 !important; font-size: 10pt !important; line-height: 1.35 !important; overflow: visible !important; }
        #return-receipt-print h1 { font-size: 18pt !important; line-height: 1.2 !important; }
        #return-receipt-print h2 { font-size: 15pt !important; line-height: 1.2 !important; }
        #return-receipt-print th, #return-receipt-print td { padding: 2.5mm 1.5mm !important; }
        #return-receipt-print .receipt-meta { gap: 3mm !important; padding-top: 4mm !important; padding-bottom: 4mm !important; }
        #return-receipt-print .receipt-total { margin-top: 5mm !important; }
        #return-receipt-print .receipt-footer { margin-top: 8mm !important; padding-top: 3mm !important; }
        .no-print { display: none !important; }
      }
    `}</style>
    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-indigo-600 mb-1"><RotateCcw size={18}/><span className="text-xs font-bold tracking-wide">{t("المبيعات وخدمة العملاء", "SALES & CUSTOMER SERVICE")}</span></div>
        <h1 className="text-2xl md:text-3xl font-black text-slate-900">{t("إدارة المرتجعات", "Returns management")}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("إرجاع جزئي أو كامل مع مراجعة المخزون والحساب المالي وإصدار إيصال مرتجع قابل للطباعة.", "Process partial or full returns, update stock and accounts, and print a return receipt.")}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-2xl border bg-white px-4 py-3 shadow-sm"><p className="text-xs text-slate-500">{t("عمليات معروضة", "Returns shown")}</p><p className="text-xl font-extrabold text-slate-900">{rows.length}</p></div>
        <div className="rounded-2xl border bg-white px-4 py-3 shadow-sm"><p className="text-xs text-slate-500">{t("إجمالي المبالغ", "Total refunds")}</p><p className="text-xl font-extrabold text-rose-600">{money(rows.reduce((sum, row) => sum + Number(row.total || 0), 0))}</p></div>
      </div>
    </header>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3"><div className="rounded-xl bg-indigo-50 p-2 text-indigo-600"><Search size={18}/></div><div><h2 className="font-bold text-slate-900">{t("بدء مرتجع جديد", "Start a new return")}</h2><p className="text-xs text-slate-500">{t("ابحث برقم الفاتورة الكامل", "Search using the complete invoice number")}</p></div></div>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1"><Search className={`absolute ${en ? "left-3" : "right-3"} top-3.5 w-4 h-4 text-slate-400`}/><input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} className={`w-full border border-slate-200 rounded-xl py-3 ${en ? "pl-10 pr-3" : "pr-10 pl-3"} outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400`} placeholder={t("مثال: INV-2026-0001", "Example: INV-2026-0001")}/></div>
        <button onClick={search} disabled={loading || !invoiceNo.trim()} className="inline-flex justify-center items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-3 font-bold">{loading ? t("جارٍ البحث...", "Searching...") : t("بحث عن الفاتورة", "Find invoice")}</button>
      </div>
    </section>

    {invoice && <section className="rounded-2xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
      <div className="bg-gradient-to-l from-indigo-50 to-white p-4 md:p-5 border-b border-indigo-100 flex items-start justify-between gap-3">
        <div><span className="text-xs font-bold text-indigo-600">{t("فاتورة البيع الأصلية", "ORIGINAL SALES INVOICE")}</span><h2 className="text-xl font-black text-slate-900 mt-1">{invoice.invoiceNumber}</h2><p className="text-sm text-slate-500 mt-1">{t("حدد الصنف والكمية المطلوب إرجاعها.", "Select the products and quantities to return.")}</p></div>
        <button onClick={() => setInvoice(null)} aria-label={t("إغلاق", "Close")} className="rounded-xl border bg-white p-2 text-slate-500 hover:text-slate-900"><X size={18}/></button>
      </div>
      <div className="p-4 md:p-5 space-y-3">
        {(invoice.items || []).map(item => {
          const isImei = (item.imeiNumbers || []).length > 0;
          const selected = selectedImeis[item.id] || [];
          const quantity = Number(qty[item.id] || 0);
          return <article key={item.id} className="rounded-xl border border-slate-200 p-3 md:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-3 text-slate-600 self-start"><PackageCheck size={20}/></div>
              <div className="flex-1 min-w-0"><h3 className="font-bold text-slate-900">{item.productName}</h3><p className="text-xs text-slate-500 mt-1">{t("مباع", "Sold")}: {item.quantity} <span className="mx-1">•</span> {t("مرتجع سابق", "Previously returned")}: {item.returnedQty} <span className="mx-1">•</span> <span className="font-bold text-emerald-700">{t("متاح", "Available")}: {item.availableQty}</span></p></div>
              <div className="flex items-center gap-2"><label className="text-xs font-semibold text-slate-600">{t("كمية المرتجع", "Return qty")}</label><input type="number" min="0" max={item.availableQty} step="1" value={qty[item.id] || 0} onChange={e => { const next = Math.min(Number(item.availableQty || 0), Math.max(0, Math.floor(Number(e.target.value) || 0))); setQty(prev => ({ ...prev, [item.id]: next })); setSelectedImeis(prev => ({ ...prev, [item.id]: (prev[item.id] || []).slice(0, next) })); }} className="w-20 border border-slate-200 rounded-lg px-2 py-2 text-center font-bold focus:ring-2 focus:ring-indigo-100 outline-none" /></div>
            </div>
            {isImei && <div className="mt-3 rounded-xl bg-amber-50/70 border border-amber-100 p-3"><div className="flex flex-wrap justify-between gap-2 mb-2"><p className="text-xs font-bold text-amber-900">{t("اختر أرقام IMEI للأجهزة المرتجعة", "Select IMEI numbers for returned devices")}</p><span className="text-xs font-bold text-amber-800">{selected.length} / {quantity}</span></div><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{(item.availableImeis || []).map(imei => <label key={imei} className="flex items-center gap-2 rounded-lg bg-white border border-amber-100 p-2 text-xs font-mono cursor-pointer"><input type="checkbox" checked={selected.includes(imei)} disabled={!selected.includes(imei) && selected.length >= quantity} onChange={e => setSelectedImeis(prev => ({ ...prev, [item.id]: e.target.checked ? [...(prev[item.id] || []), imei] : (prev[item.id] || []).filter(value => value !== imei) }))}/>{imei}</label>)}</div>{!item.availableImeis?.length && <p className="text-xs text-amber-800 mt-2">{t("لا توجد أرقام IMEI متاحة لهذا الصنف في هذه الفاتورة.", "No eligible IMEI numbers are available for this invoice item.")}</p>}</div>}
            {!isImei && <p className="text-xs text-slate-400 mt-2">{t("صنف عادي: يتم احتساب المرتجع بالكمية فقط.", "Quantity-based item: no IMEI is required.")}</p>}
          </article>;
        })}
        <div className="grid md:grid-cols-2 gap-3 pt-1">
          <label className="text-xs font-semibold text-slate-600">{t("حساب رد المبلغ", "Refund account")}<select value={refundAccountId} onChange={e => setRefundAccountId(e.target.value)} className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-3 text-sm font-normal bg-white"><option value="">{t("اختر الحساب المالي", "Choose an account")}</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name} — {money(account.balance)}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600">{t("سبب المرتجع (اختياري)", "Return reason (optional)")}<input value={reason} onChange={e => setReason(e.target.value)} maxLength={300} className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-3 text-sm font-normal outline-none focus:ring-2 focus:ring-indigo-100" placeholder={t("مثال: المنتج غير مناسب", "e.g. Product not suitable")}/></label>
        </div>
        <button onClick={submit} disabled={submitting} className="w-full inline-flex justify-center items-center gap-2 mt-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white py-3.5 rounded-xl font-bold shadow-sm"><RotateCcw size={18}/>{submitting ? t("جارٍ تنفيذ المرتجع...", "Processing return...") : t("تأكيد المرتجع ورد المبلغ", "Confirm return and refund")}</button>
      </div>
    </section>}

    {lastReturn && <section className="no-print rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3"><div className="rounded-full bg-emerald-100 text-emerald-700 p-2"><CheckCircle2 size={22}/></div><div><h2 className="font-bold text-emerald-950">{t("إيصال المرتجع جاهز", "Return receipt is ready")}</h2><p className="text-sm text-emerald-800">{lastReturn.returnNumber || "—"} · {money(lastReturn.total)} </p></div></div>
      <div className="flex gap-2"><button onClick={() => printReceipt(lastReturn)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 text-white px-4 py-2.5 font-bold"><Printer size={17}/>{t("طباعة الإيصال", "Print receipt")}</button><button onClick={() => setLastReturn(null)} className="rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-slate-600" aria-label={t("إخفاء", "Dismiss")}><X size={17}/></button></div>
    </section>}

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="p-4 md:p-5 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"><div className="flex items-center gap-2"><div className="rounded-xl bg-slate-100 p-2 text-slate-600"><Receipt size={19}/></div><div><h2 className="font-bold text-slate-900">{t("سجل المرتجعات", "Returns history")}</h2><p className="text-xs text-slate-500 mt-0.5">{t("يمكنك فتح تفاصيل أي مرتجع وطباعة إيصال له.", "Open any return to view its details and print a receipt.")}</p></div></div><span className="text-xs text-slate-500">{rows.length} {t("عملية", "records")}</span></div>
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[720px]"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3 text-right">{t("رقم المرتجع", "Return no.")}</th><th className="p-3 text-right">{t("فاتورة البيع", "Sales invoice")}</th><th className="p-3 text-right">{t("حساب الرد", "Refund account")}</th><th className="p-3 text-right">{t("بواسطة", "Processed by")}</th><th className="p-3 text-right">{t("التاريخ", "Date")}</th><th className="p-3 text-left">{t("الإجمالي", "Total")}</th><th className="p-3 text-center">{t("الإيصال", "Receipt")}</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70"><td className="p-3 font-mono font-bold text-slate-800">{row.returnNumber}</td><td className="p-3 font-mono">{row.invoice?.invoiceNumber || "—"}</td><td className="p-3">{row.refundAccount?.name || "—"}</td><td className="p-3">{row.user?.name || "—"}</td><td className="p-3 text-xs text-slate-500">{dateText(row.createdAt, locale)}</td><td className="p-3 text-left font-bold text-rose-600">-{money(row.total)}</td><td className="p-3"><div className="flex justify-center gap-1"><button onClick={() => openReceipt(row)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100" title={t("عرض الإيصال", "View receipt")}><FileText size={16}/></button><button onClick={() => printReceipt(row)} className="rounded-lg border border-slate-200 p-2 text-indigo-600 hover:bg-indigo-50" title={t("طباعة الإيصال", "Print receipt")}><Printer size={16}/></button></div></td></tr>)}{!rows.length && <tr><td colSpan="7" className="p-12 text-center text-slate-400">{t("لا توجد مرتجعات مسجلة حتى الآن", "No returns recorded yet")}</td></tr>}</tbody></table></div>
    </section>

    {lastReturn && <section id="return-receipt-print" className="bg-white text-slate-900 p-6 border border-slate-200 rounded-xl max-w-3xl mx-auto">
      <div className="flex justify-between items-start gap-4 border-b-2 border-slate-900 pb-4"><div><h1 className="text-2xl font-black">{activeBranch?.name || t("الفرع", "Branch")}</h1><p className="text-sm mt-1">{activeBranch?.address || ""}</p><p className="text-sm">{activeBranch?.phone || ""}</p></div><div className="text-left"><h2 className="text-xl font-black">{t("إيصال مرتجع", "SALES RETURN RECEIPT")}</h2><p className="font-mono mt-2">{lastReturn.returnNumber || "—"}</p><p className="text-sm mt-1">{dateText(lastReturn.createdAt, locale)}</p></div></div>
      <div className="receipt-meta grid grid-cols-2 gap-4 py-4 text-sm"><div><p className="text-slate-500">{t("رقم فاتورة البيع", "Original invoice")}</p><p className="font-bold font-mono">{lastReturn.invoice?.invoiceNumber || invoice?.invoiceNumber || "—"}</p></div><div><p className="text-slate-500">{t("حساب رد المبلغ", "Refund account")}</p><p className="font-bold">{lastReturn.refundAccount?.name || "—"}</p></div><div><p className="text-slate-500">{t("نفذ العملية", "Processed by")}</p><p className="font-bold">{lastReturn.user?.name || t("مستخدم النظام", "System user")}</p></div><div><p className="text-slate-500">{t("سبب المرتجع", "Return reason")}</p><p className="font-bold">{lastReturn.reason || reason || "—"}</p></div></div>
      <table className="w-full text-sm border-collapse"><thead><tr className="border-y-2 border-slate-900"><th className="py-2 text-right">{t("الصنف", "Product")}</th><th className="py-2 text-center">{t("الكمية", "Qty")}</th><th className="py-2 text-left">{t("سعر الوحدة المسترد", "Unit refund")}</th><th className="py-2 text-left">{t("الإجمالي", "Line total")}</th></tr></thead><tbody>{receiptItems.map((item, index) => <tr key={item.id || index} className="border-b border-slate-300"><td className="py-2"><p className="font-semibold">{item.product?.name || item.productName || t("صنف", "Product")}</p>{(item.imeiNumbers || []).length > 0 && <p className="text-xs mt-1">{t("IMEI", "IMEI")}: {(item.imeiNumbers || []).join(", ")}</p>}</td><td className="py-2 text-center">{item.quantity}</td><td className="py-2 text-left">{money(item.unitRefund)}</td><td className="py-2 text-left font-bold">{money(item.lineRefund)}</td></tr>)}</tbody></table>
      <div className="receipt-total flex justify-end mt-5"><div className="w-64 border-t-2 border-slate-900 pt-3 flex justify-between text-lg font-black"><span>{t("المبلغ المسترد", "Refund total")}</span><span>{money(lastReturn.total)}</span></div></div>
      <p className="receipt-footer text-center text-xs mt-10 border-t border-slate-300 pt-4">{t("تم إصدار هذا الإيصال بواسطة نظام إدارة المبيعات والمخزون.", "This receipt was issued by the sales and inventory management system.")}</p>
      <div className="no-print mt-4 flex justify-end gap-2"><button onClick={() => window.print()} className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg"><Printer size={16}/>{t("طباعة", "Print")}</button><button onClick={() => setLastReturn(null)} className="border px-4 py-2 rounded-lg">{t("إغلاق", "Close")}</button></div>
    </section>}
  </div>;
}
