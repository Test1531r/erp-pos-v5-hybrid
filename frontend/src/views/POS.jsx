import { useState, useEffect, useRef, useCallback } from "react";
import { useStore, api } from "../store/index.js";
import { Search, X, Plus, Minus, Trash2, User, ShoppingCart, CheckCircle2, Loader2, ScanLine, AlertTriangle, Package, Printer, ChevronDown, ChevronUp, Tag, Banknote, CreditCard, Smartphone, QrCode, HandCoins } from "lucide-react";
import toast from "react-hot-toast";
import { useDialog } from "../components/InteractionProvider.jsx";

const PAYMENT_METHODS = [
  { value: "CASH", label: "كاش", icon: Banknote, color: "text-green-600", bg: "bg-green-50 border-green-300" },
  { value: "CARD", label: "كارت", icon: CreditCard, color: "text-blue-600", bg: "bg-blue-50 border-blue-300" },
  { value: "VODAFONE_CASH", label: "فودافون كاش", icon: Smartphone, color: "text-red-600", bg: "bg-red-50 border-red-300" },
  { value: "INSTAPAY", label: "إنستاباي", icon: QrCode, color: "text-teal-600", bg: "bg-teal-50 border-teal-300" },
  { value: "BANK_TRANSFER", label: "تحويل بنكي", icon: Banknote, color: "text-purple-600", bg: "bg-purple-50 border-purple-300" },
  { value: "CREDIT", label: "آجل / أقساط", icon: HandCoins, color: "text-amber-600", bg: "bg-amber-50 border-amber-300" },
];

// ── IMEI MODAL ─────────────────────────────────────────────
function IMEIModal({ item, onClose }) {
  const [input, setInput] = useState("");
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const addIMEI = useStore((s) => s.addIMEI);
  const removeIMEI = useStore((s) => s.removeIMEI);
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  const handleLookup = async () => {
    if (!input.trim()) return;
    setLookupLoading(true);
    try {
      const { data } = await api.get(`/inventory/imei/${input.trim()}`);
      setLookupResult({ ok: true, data });
    } catch {
      setLookupResult({ ok: false });
    }
    setLookupLoading(false);
  };

  const handleAdd = () => {
    const result = addIMEI(item.id, input.trim());
    if (result.ok) { setInput(""); setLookupResult(null); inputRef.current?.focus(); toast.success("تم إضافة IMEI"); }
    else toast.error(result.error);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><ScanLine className="w-5 h-5 text-indigo-600" /> إدخال IMEI</h3>
            <p className="text-sm text-slate-500 mt-0.5">{item.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Progress */}
          <div className="flex items-center justify-between bg-indigo-50 rounded-xl p-3">
            <span className="text-sm text-indigo-700">الأرقام المدخلة</span>
            <span className={`text-xl font-bold ${item.imeiNumbers.length === item.quantity ? "text-green-600" : "text-indigo-600"}`}>
              {item.imeiNumbers.length} / {item.quantity}
            </span>
          </div>
          {/* Input */}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); setLookupResult(null); }}
              onKeyDown={(e) => e.key === "Enter" && (lookupResult ? handleAdd() : handleLookup())}
              placeholder="امسح أو اكتب رقم IMEI..."
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button onClick={handleLookup} disabled={lookupLoading || !input.trim()} className="bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
              {lookupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "تحقق"}
            </button>
            <button onClick={handleAdd} disabled={!input.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
              إضافة
            </button>
          </div>
          {/* Lookup result */}
          {lookupResult && (
            <div className={`rounded-xl p-3 text-sm ${lookupResult.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {lookupResult.ok ? `✅ IMEI موجود — ${lookupResult.data.status === "IN_STOCK" ? "متاح" : "غير متاح"} ${lookupResult.data.color ? `| لون: ${lookupResult.data.color}` : ""}` : "❌ IMEI غير موجود في النظام"}
            </div>
          )}
          {/* List */}
          {item.imeiNumbers.length > 0 && (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {item.imeiNumbers.map((imei) => (
                <div key={imei} className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  <span className="text-sm font-mono text-green-800 flex-1">{imei}</span>
                  <button onClick={() => removeIMEI(item.id, imei)} className="text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-5 border-t flex gap-2">
          <button onClick={onClose} className="flex-1 border border-slate-200 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50">إغلاق</button>
          {item.imeiNumbers.length === item.quantity && (
            <button onClick={onClose} className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-green-700">✅ تم</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── CUSTOMER MODAL ──────────────────────────────────────────
function CustomerModal({ onClose, onSelect }) {
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const createCustomer = useStore((s) => s.createCustomer);

  useEffect(() => {
    setLoading(true);
    api.get(`/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`)
      .then(({ data }) => setCustomers(data)).finally(() => setLoading(false));
  }, [search]);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    const result = await createCustomer(form);
    if (result.success) { onSelect(result.data); onClose(); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><User className="w-5 h-5 text-indigo-600" /> {showCreate ? "إضافة عميل جديد" : "اختيار عميل"}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-5">
          {!showCreate ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الهاتف..." className="w-full border rounded-xl py-2.5 pr-9 pl-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" autoFocus />
                </div>
                <button onClick={() => setShowCreate(true)} className="bg-indigo-600 text-white px-4 rounded-xl text-sm font-medium">+ جديد</button>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {loading ? <div className="text-center py-6 text-slate-400">جاري البحث...</div> :
                  customers.length === 0 ? <div className="text-center py-6 text-slate-400">لا توجد نتائج</div> :
                    customers.map((c) => (
                      <button key={c.id} onClick={() => { onSelect(c); onClose(); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-indigo-50 text-right transition-colors">
                        <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-sm shrink-0">{c.name.slice(0, 2)}</div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                          <p className="text-xs text-slate-500">{c.phone || c.email || "—"}</p>
                        </div>
                        <span className="mr-auto text-xs text-slate-400">{parseFloat(c.totalSpent || 0).toLocaleString()} ج</span>
                      </button>
                    ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="الاسم *" className="w-full border rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" autoFocus />
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="رقم الهاتف" className="w-full border rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="البريد الإلكتروني" type="email" className="w-full border rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <div className="flex gap-2">
                <button onClick={() => setShowCreate(false)} className="flex-1 border py-2.5 rounded-xl text-sm">رجوع</button>
                <button onClick={handleCreate} disabled={!form.name.trim()} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">حفظ وتحديد</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── CHECKOUT MODAL ──────────────────────────────────────────
function CheckoutModal({ onClose }) {
  const { cartItems, cartCustomer, cartDiscount, cartTaxRate, checkout, checkoutLoading, lastInvoice, getCartTotals, validateIMEIs, language } = useStore();
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;
  const totals = getCartTotals();
  const [method, setMethod] = useState("CASH");
  const [amountPaid, setAmountPaid] = useState(totals.total.toFixed(2));
  const [mixed, setMixed] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [splits, setSplits] = useState([{ method: "CASH", amount: "", accountId: "" }, { method: "CARD", amount: "", accountId: "" }]);
  const [receipt, setReceipt] = useState(null);
  const [credit, setCredit] = useState({ dueDate: "", installmentsCount: 0, firstDueDate: "" });
  const [promotionCode, setPromotionCode] = useState("");
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [discountApprovalId, setDiscountApprovalId] = useState("");
  const [discountApprovalLoading, setDiscountApprovalLoading] = useState(false);
  const [discountApprovalStatus, setDiscountApprovalStatus] = useState("NONE");
  const [branchDiscountLimit, setBranchDiscountLimit] = useState(null);
  const user = useStore((s) => s.user);
  const discountPct = totals.subtotal > 0 ? (Number(cartDiscount || 0) / totals.subtotal) * 100 : 0;
  const needsDiscountApproval = user?.role !== "SUPER_ADMIN" && ((user?.role === "CASHIER" && discountPct > Number(user?.maxDiscountPct || 0)) || (branchDiscountLimit !== null && discountPct > branchDiscountLimit));
  const imeiVal = validateIMEIs();

  useEffect(() => {
    setDiscountApprovalId("");
    setDiscountApprovalStatus("NONE");
  }, [cartDiscount, totals.subtotal, cartItems]);

  useEffect(() => {
    if (!discountApprovalId || !needsDiscountApproval || discountApprovalStatus === "APPROVED") return;
    let alive = true;
    const check = async () => {
      try {
        const { data } = await api.get("/approvals?status=APPROVED");
        const approved = (Array.isArray(data) ? data : []).find(r => r.id === discountApprovalId && !r.entityId);
        if (alive && approved) {
          setDiscountApprovalStatus("APPROVED");
          toast.success("تمت الموافقة على الخصم. يمكنك إتمام البيع الآن.");
        }
      } catch {}
    };
    check();
    const timer = setInterval(check, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [discountApprovalId, needsDiscountApproval, discountApprovalStatus]);

  useEffect(() => { setAmountPaid(totals.total.toFixed(2)); }, [totals.total]);
  useEffect(() => { Promise.all([api.get("/finance/accounts"), api.get("/settings")]).then(([a, s]) => { setAccounts(a.data); const v=s.data?.requireApprovalDiscountAbove; setBranchDiscountLimit(v === null || v === undefined || v === "" ? null : Number(v)); }).catch(() => { setAccounts([]); setBranchDiscountLimit(null); }); }, []);

  const paid = parseFloat(amountPaid) || 0;
  const change = Math.max(0, paid - totals.total);
  const splitTotal = splits.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const canCheckout = (mixed ? Math.abs(splitTotal - totals.total) < 0.01 && splits.filter(p => Number(p.amount) > 0).length >= 2 : method === "CREDIT" ? !!cartCustomer : paid >= totals.total - 0.01) && imeiVal.valid;

  const handleCheckout = async () => {
    const paymentSplits = mixed ? splits.filter(p => Number(p.amount) > 0).map(p => ({ method: p.method, amount: Number(p.amount), accountId: p.accountId || undefined })) : null;
    const result = await checkout(mixed ? "MIXED" : method, mixed ? splitTotal : (method === "CREDIT" ? 0 : paid), paymentSplits, { promotionCode: promotionCode.trim() || undefined, redeemPoints: Number(redeemPoints) || 0, ...(discountApprovalId ? { approvalRequestId: discountApprovalId } : {}), ...(method === "CREDIT" ? credit : {}) });
    if (result.success) setReceipt(result);
  };

  const requestDiscountApproval = async () => {
    if (!needsDiscountApproval || discountApprovalLoading) return;
    setDiscountApprovalLoading(true);
    try {
      const cartSignature = cartItems.map(i => `${i.productId}:${i.quantity}:${Number(i.unitPrice).toFixed(2)}:${Number(i.discountPct || 0).toFixed(2)}`).sort().join("|");
      const { data } = await api.post("/approvals", {
        entityType: "DISCOUNT",
        action: "APPROVE_DISCOUNT",
        amount: Number(cartDiscount),
        reason: "اعتماد خصم يتجاوز الحد المسموح للكاشير",
        payload: { discountAmount: Number(Number(cartDiscount).toFixed(2)), subtotal: Number(totals.subtotal.toFixed(2)), itemCount: cartItems.length, cartSignature }
      });
      setDiscountApprovalId(data.id);
      setDiscountApprovalStatus("PENDING");
      toast.success("تم إرسال طلب الخصم. سيتم التحقق من الموافقة تلقائيًا.");
    } catch (e) {
      toast.error(e.response?.data?.error || "تعذر إرسال طلب الموافقة");
    } finally {
      setDiscountApprovalLoading(false);
    }
  };

  const handlePrint = () => {
    const inv = lastInvoice;
    const win = window.open("", "_blank");
    win.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>فاتورة</title>
    <style>body{font-family:Arial;width:80mm;margin:0 auto;font-size:12px}
    .c{text-align:center}.b{font-weight:bold}.sep{border-top:1px dashed #000;margin:6px 0}
    .row{display:flex;justify-content:space-between}</style></head><body>
    <div class="c"><h2>📱 متجر الإلكترونيات</h2><p class="b">فاتورة مبيعات</p>
    <p>${inv.invoiceNumber}</p><p>${new Date(inv.createdAt).toLocaleString("ar-EG")}</p></div>
    <div class="sep"></div>
    ${(inv.items || []).map((i) => `<div><p class="b">${i.productName}</p>
    <div class="row"><span>${i.quantity} × ${parseFloat(i.unitPrice).toFixed(2)}</span><span>${parseFloat(i.lineTotal).toFixed(2)}</span></div>
    ${i.imeiNumbers?.length ? `<p style="font-size:10px">IMEI: ${i.imeiNumbers.join(", ")}</p>` : ""}</div><div class="sep" style="border-style:dotted"></div>`).join("")}
    <div class="row"><span>المجموع</span><span>${parseFloat(inv.subtotal).toFixed(2)}</span></div>
    ${parseFloat(inv.discountAmount) > 0 ? `<div class="row"><span>{t(t("خصم", "Discount"), "Discount")}</span><span>-${parseFloat(inv.discountAmount).toFixed(2)}</span></div>` : ""}
    ${parseFloat(inv.taxAmount) > 0 ? `<div class="row"><span>{t(t("ضريبة", "Tax"), "Tax")}</span><span>${parseFloat(inv.taxAmount).toFixed(2)}</span></div>` : ""}
    <div class="sep"></div><div class="row b" style="font-size:14px"><span>{t(t("الإجمالي", "Total"), "Total")}</span><span>${parseFloat(inv.total).toFixed(2)}</span></div>
    <div class="sep"></div>
    <div class="row"><span>المدفوع</span><span>${parseFloat(inv.amountPaid).toFixed(2)}</span></div>
    ${parseFloat(inv.changeGiven) > 0 ? `<div class="row b"><span>{t(t("الباقي", "Change due"), "Change due")}</span><span>${parseFloat(inv.changeGiven).toFixed(2)}</span></div>` : ""}
    <div class="sep"></div><div class="c"><p>شكراً لتسوقكم معنا!</p><p>الإرجاع خلال 7 أيام بالفاتورة</p></div>
    </body></html>`);
    win.document.close(); win.focus(); win.print(); win.close();
  };

  if (receipt) return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl text-center p-8">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h3 className="text-xl font-bold text-slate-800">تم البيع بنجاح!</h3>
        <p className="text-slate-500 text-sm mt-1 font-mono">{lastInvoice?.invoiceNumber}</p>
        <div className="grid grid-cols-2 gap-3 mt-5">
          <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-500">{t(t("الإجمالي", "Total"), "Total")}</p><p className="font-bold text-lg">{parseFloat(lastInvoice?.total || 0).toFixed(2)}</p></div>
          <div className="bg-green-50 rounded-xl p-3"><p className="text-xs text-slate-500">{t(t("الباقي", "Change due"), "Change due")}</p><p className="font-bold text-lg text-green-600">{receipt.change?.toFixed(2)}</p></div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 border border-slate-200 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50">بيع جديد</button>
          <button onClick={handlePrint} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-indigo-700">
            <Printer className="w-4 h-4" /> طباعة
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b flex items-center justify-between sticky top-0 bg-white z-10">
          <h3 className="font-bold text-slate-800 text-lg">{t(t("إتمام البيع", "Complete sale"), "Complete sale")}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-5">
          {/* Summary */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between text-slate-600"><span>{t(t("المجموع الفرعي", "Subtotal"), "Subtotal")}</span><span>{totals.subtotal.toFixed(2)} ج</span></div>
            {cartDiscount > 0 && <div className="flex justify-between text-green-600"><span>{t(t("خصم", "Discount"), "Discount")}</span><span>−{parseFloat(cartDiscount).toFixed(2)} ج</span></div>}
            {cartTaxRate > 0 && <div className="flex justify-between text-slate-600"><span>ضريبة ({cartTaxRate}%)</span><span>{totals.taxAmount.toFixed(2)} ج</span></div>}
            <div className="border-t pt-2 flex justify-between font-bold text-lg"><span>{t(t("الإجمالي", "Total"), "Total")}</span><span className="text-indigo-600">{totals.total.toFixed(2)} ج</span></div>
            {cartCustomer && <div className="text-indigo-600 text-xs flex items-center gap-1"><User className="w-3 h-3" /> {cartCustomer.name}</div>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-2 block">كود العرض / الكوبون</label>
              <input value={promotionCode} onChange={(e)=>setPromotionCode(e.target.value.toUpperCase())} placeholder="مثال: SUMMER10" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-2 block">استبدال نقاط الولاء {cartCustomer ? `(المتاح ${cartCustomer.loyaltyPoints || 0})` : ""}</label>
              <input type="number" min="0" max={cartCustomer?.loyaltyPoints || 0} disabled={!cartCustomer} value={redeemPoints} onChange={(e)=>setRedeemPoints(Math.max(0, Math.min(Number(e.target.value)||0, cartCustomer?.loyaltyPoints||0)))} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>

          {needsDiscountApproval && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2">
              <p className="text-sm font-semibold text-amber-900">هذا الخصم يتجاوز حدك المسموح ({Number(user?.maxDiscountPct || 0)}%). يلزم اعتماد المدير قبل إتمام البيع.</p>
              {discountApprovalId && <p className={`text-xs font-semibold ${discountApprovalStatus === "APPROVED" ? "text-green-700" : "text-amber-800"}`}>رقم الطلب: {discountApprovalId} — {discountApprovalStatus === "APPROVED" ? "تمت الموافقة، يمكنك إتمام البيع." : "بانتظار اعتماد المدير..."}</p>}
              <button type="button" onClick={requestDiscountApproval} disabled={discountApprovalLoading || !!discountApprovalId} className="w-full rounded-lg bg-amber-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
                {discountApprovalLoading ? "جارٍ إرسال الطلب..." : discountApprovalStatus === "APPROVED" ? "تمت الموافقة" : discountApprovalId ? "تم إرسال الطلب — بانتظار المدير" : "طلب موافقة المدير على الخصم"}
              </button>
              <p className="text-xs text-amber-800">بعد اعتماد الطلب، حدّث صفحة الموافقات أو انتظر القرار ثم أعد إتمام البيع.</p>
            </div>
          )}

          {/* IMEI warning */}
          {!imeiVal.valid && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
              <p className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> مطلوب إدخال IMEI</p>
              {imeiVal.errors.map((e, i) => <p key={i} className="mt-1 text-xs">{e}</p>)}
            </div>
          )}

          {/* Payment method */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">طريقة الدفع</p>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map(({ value, label, icon: Icon, color, bg }) => (
                <button key={value} onClick={() => setMethod(value)} className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-medium transition-all ${method === value ? bg + " border-2" : "border-slate-200 hover:bg-slate-50"}`}>
                  <Icon className={`w-5 h-5 ${method === value ? color : "text-slate-400"}`} />
                  {t(label, ({ "كاش": "Cash", "كارت": "Card", "فودافون كاش": "Vodafone Cash", "إنستاباي": "InstaPay", "تحويل بنكي": "Bank transfer", "آجل / أقساط": "Credit / installments" })[label] || label)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-xl p-3">
            <div><p className="text-sm font-semibold text-indigo-800">{t(t("دفع مختلط", "Split payment"), "Split payment")}</p><p className="text-xs text-indigo-600">{t(t("قسّم الفاتورة بين كاش / كارت / فودافون / إنستاباي / بنك", "Split the invoice across cash, card, Vodafone Cash, InstaPay or bank"), "Split the invoice across cash, card, Vodafone Cash, InstaPay or bank")}</p></div>
            <button onClick={() => setMixed(!mixed)} className={`w-12 h-7 rounded-full p-1 transition-colors ${mixed ? "bg-indigo-600" : "bg-slate-300"}`}><span className={`block w-5 h-5 bg-white rounded-full transition-transform ${mixed ? "-translate-x-5" : ""}`} /></button>
          </div>

          {mixed && <div className="space-y-2">
            {splits.map((p, idx) => {
              const allowed = accounts.filter((a) =>
                ({ CASH: "CASHBOX", CARD: "CARD", BANK_TRANSFER: "BANK", VODAFONE_CASH: "VODAFONE_CASH", INSTAPAY: "INSTAPAY" }[p.method] === a.type) ||
                a.type === "WALLET" ||
                a.type === "OTHER"
              );
              return <div key={idx} className="grid grid-cols-12 gap-2 border rounded-xl p-2">
              <select value={p.method} onChange={e => setSplits(splits.map((x,i)=>i===idx?{...x,method:e.target.value,accountId:""}:x))} className="col-span-4 border rounded-lg px-2 py-2 text-xs">{PAYMENT_METHODS.filter(m => m.value !== "CREDIT").map(m=><option key={m.value} value={m.value}>{m.label}</option>)}</select>
              <select value={p.accountId} onChange={e => setSplits(splits.map((x,i)=>i===idx?{...x,accountId:e.target.value}:x))} className="col-span-5 border rounded-lg px-2 py-2 text-xs"><option value="">الحساب الافتراضي</option>{allowed.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
              <input type="number" value={p.amount} onChange={e => setSplits(splits.map((x,i)=>i===idx?{...x,amount:e.target.value}:x))} placeholder="0.00" className="col-span-3 border rounded-lg px-2 py-2 text-xs" />
            </div>})}
            <div className="flex items-center justify-between text-sm"><button onClick={() => setSplits([...splits,{method:"CASH",amount:"",accountId:""}])} className="text-indigo-600 font-medium flex items-center gap-1"><Plus className="w-3 h-3"/>إضافة طريقة</button><span className={Math.abs(splitTotal-totals.total)<0.01?"text-green-600 font-bold":"text-amber-600 font-bold"}>المقسّم: {splitTotal.toFixed(2)} / {totals.total.toFixed(2)}</span></div>
          </div>}

          {method === "CREDIT" && !mixed && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-3">
              <p className="text-sm font-semibold text-amber-800">بيع آجل / أقساط</p>
              {!cartCustomer && <p className="text-xs text-red-600">يجب اختيار عميل من السلة أولاً.</p>}
              <div className="grid grid-cols-3 gap-2">
                <div><label className="text-[11px] text-slate-500">{t(t("تاريخ الاستحقاق", "Due date"), "Due date")}</label><input type="date" value={credit.dueDate} onChange={e=>setCredit({...credit,dueDate:e.target.value})} className="w-full border rounded-lg px-2 py-2 text-xs bg-white"/></div>
                <div><label className="text-[11px] text-slate-500">{t(t("عدد الأقساط", "Installment count"), "Installment count")}</label><input type="number" min="0" max="60" value={credit.installmentsCount} onChange={e=>setCredit({...credit,installmentsCount:Number(e.target.value)})} className="w-full border rounded-lg px-2 py-2 text-xs bg-white"/></div>
                <div><label className="text-[11px] text-slate-500">أول قسط</label><input type="date" value={credit.firstDueDate} onChange={e=>setCredit({...credit,firstDueDate:e.target.value})} className="w-full border rounded-lg px-2 py-2 text-xs bg-white"/></div>
              </div>
            </div>
          )}

          {/* Amount paid */}
          {!mixed && method !== "CREDIT" && <div>
            <label className="text-sm font-semibold text-slate-700 mb-2 block">{t(t("المبلغ المدفوع", "Amount paid"), "Amount paid")}</label>
            <input
              type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)}
              className="w-full border-2 border-indigo-200 rounded-xl py-3 px-4 text-2xl font-bold text-center focus:outline-none focus:border-indigo-500"
              min={0} step={0.01} autoFocus
            />
            {/* Quick amounts */}
            <div className="flex gap-2 mt-2 flex-wrap">
              {[...new Set([Math.ceil(totals.total / 10) * 10, Math.ceil(totals.total / 50) * 50, Math.ceil(totals.total / 100) * 100, Math.ceil(totals.total / 500) * 500])].filter((v) => v >= totals.total).slice(0, 4).map((v) => (
                <button key={v} onClick={() => setAmountPaid(v.toFixed(2))} className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg font-medium">{v.toFixed(0)} ج</button>
              ))}
              <button onClick={() => setAmountPaid(totals.total.toFixed(2))} className="text-xs bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-3 py-1.5 rounded-lg font-medium">المبلغ بالظبط</button>
            </div>
            {paid >= totals.total && <p className="text-green-600 text-sm font-medium mt-2">الباقي: {change.toFixed(2)} ج</p>}
            {paid > 0 && paid < totals.total && <p className="text-red-500 text-sm mt-2">ناقص: {(totals.total - paid).toFixed(2)} ج</p>}
          </div>}
        </div>

        <div className="p-5 border-t">
          <button onClick={handleCheckout} disabled={!canCheckout || checkoutLoading || (needsDiscountApproval && discountApprovalStatus !== "APPROVED")} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg flex items-center justify-center gap-2 transition-colors">
            {checkoutLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> جاري المعالجة...</> : <><CheckCircle2 className="w-5 h-5" /> إتمام البيع — {totals.total.toFixed(2)} ج</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CART ITEM ROW ───────────────────────────────────────────
function CartItem({ item }) {
  const [expanded, setExpanded] = useState(false);
  const updateQty = useStore((s) => s.updateQty);
  const removeFromCart = useStore((s) => s.removeFromCart);
  const updateDiscount = useStore((s) => s.updateDiscount);
  const updatePrice = useStore((s) => s.updatePrice);
  const [imeiOpen, setImeiOpen] = useState(false);

  const lineTotal = item.unitPrice * item.quantity * (1 - (item.discountPct || 0) / 100);
  const imeiNeeded = item.hasIMEI && item.imeiNumbers.length < item.quantity;

  return (
    <>
      <div className={`rounded-xl border p-3 transition-colors ${imeiNeeded ? "border-amber-300 bg-amber-50" : "border-slate-100 bg-white"}`}>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 leading-tight truncate">{item.name}</p>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{item.sku}</p>
            {item.hasIMEI && (
              <button onClick={() => setImeiOpen(true)} className={`text-xs mt-1 flex items-center gap-1 font-medium ${imeiNeeded ? "text-amber-600" : "text-green-600"}`}>
                <ScanLine className="w-3 h-3" /> IMEI: {item.imeiNumbers.length}/{item.quantity} {imeiNeeded && <AlertTriangle className="w-3 h-3" />}
              </button>
            )}
          </div>
          {/* Qty controls */}
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => updateQty(item.id, item.quantity - 1)} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><Minus className="w-3 h-3" /></button>
            <span className="w-8 text-center font-bold text-sm">{item.quantity}</span>
            <button onClick={() => updateQty(item.id, item.quantity + 1)} disabled={item.quantity >= item._maxQty} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center disabled:opacity-40"><Plus className="w-3 h-3" /></button>
            <button onClick={() => removeFromCart(item.id)} className="w-7 h-7 rounded-lg hover:bg-red-50 text-red-400 flex items-center justify-center ml-1"><X className="w-3.5 h-3.5" /></button>
          </div>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-slate-500">{item.unitPrice.toFixed(2)} × {item.quantity}</span>
          <div className="flex items-center gap-2">
            {item.discountPct > 0 && <span className="text-xs text-slate-400 line-through">{(item.unitPrice * item.quantity).toFixed(2)}</span>}
            <span className="text-sm font-bold text-slate-800">{lineTotal.toFixed(2)} ج</span>
          </div>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-[11px] text-indigo-500 flex items-center gap-1 mt-1">
          <Tag className="w-2.5 h-2.5" /> السعر / الخصم {expanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
        </button>
        {expanded && (
          <div className="grid grid-cols-2 gap-2 mt-2 border-t pt-2">
            <div>
              <label className="text-[10px] text-slate-500">السعر</label>
              <input type="number" value={item.unitPrice} onChange={(e) => updatePrice(item.id, parseFloat(e.target.value))} className="w-full border rounded-lg px-2 py-1 text-xs mt-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">خصم %</label>
              <input type="number" value={item.discountPct} onChange={(e) => updateDiscount(item.id, parseFloat(e.target.value))} min={0} max={100} className="w-full border rounded-lg px-2 py-1 text-xs mt-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
            </div>
          </div>
        )}
      </div>
      {imeiOpen && <IMEIModal item={item} onClose={() => setImeiOpen(false)} />}
    </>
  );
}

// ── PRODUCT CARD ────────────────────────────────────────────
function ProductCard({ product, stock, onAdd }) {
  const outOfStock = stock === 0;
  const lowStock = stock > 0 && stock <= product.lowStockQty;
  return (
    <button
      onClick={() => !outOfStock && onAdd(product)}
      disabled={outOfStock}
      className={`group relative flex flex-col rounded-2xl border text-right overflow-hidden transition-all duration-200
        ${outOfStock ? "opacity-50 cursor-not-allowed bg-slate-50 border-slate-200" : "bg-white border-slate-200 hover:border-indigo-400 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"}`}
    >
      {/* Image */}
      <div className="relative w-full pt-[65%] bg-gradient-to-br from-slate-100 to-slate-200">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="absolute inset-0 w-full h-full object-contain p-2" onError={(e) => { e.target.style.display = "none"; }} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center"><Package className="w-10 h-10 text-slate-400" /></div>
        )}
        {product.hasIMEI && <div className="absolute top-1.5 right-1.5 bg-blue-100 text-blue-700 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><ScanLine className="w-2.5 h-2.5" /> IMEI</div>}
        {lowStock && <div className="absolute top-1.5 left-1.5 bg-amber-100 text-amber-700 text-[10px] font-medium px-1.5 py-0.5 rounded-full">منخفض</div>}
        {outOfStock && <div className="absolute inset-0 bg-white/60 flex items-center justify-center"><span className="text-xs font-bold text-red-600 bg-white px-2 py-1 rounded-lg">نفذ المخزون</span></div>}
        {!outOfStock && <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/10 transition-colors flex items-center justify-center"><div className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-lg transition-all"><Plus className="w-5 h-5" /></div></div>}
      </div>
      {/* Info */}
      <div className="p-3 flex flex-col gap-1">
        <p className="text-xs font-bold text-slate-800 leading-tight line-clamp-2">{product.name}</p>
        {product.brand && <p className="text-[10px] text-slate-400">{product.brand}</p>}
        <p className="text-[10px] text-slate-400 font-mono">{product.sku}</p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-sm font-bold text-indigo-600">{parseFloat(product.salePrice).toLocaleString()} ج</span>
          <span className={`text-[10px] font-semibold ${outOfStock ? "text-red-500" : lowStock ? "text-amber-600" : "text-green-600"}`}>كمية: {stock}</span>
        </div>
      </div>
    </button>
  );
}

// ── MAIN POS ────────────────────────────────────────────────
export default function POS() {
  const { confirm } = useDialog();
  const { cartItems, cartCustomer, cartDiscount, cartTaxRate, cartNotes, searchQuery, selectedCategory, categories, activeBranch,
    addToCart, setCustomer, clearCustomer, setDiscount, setTaxRate, setNotes, clearCart, getCartTotals, getFilteredProducts, getStock, setSearch, setCategory, fetchProducts, language } = useStore();
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;

  const [customerModal, setCustomerModal] = useState(false);
  const [checkoutModal, setCheckoutModal] = useState(false);
  const searchRef = useRef(null);
  const totals = getCartTotals();
  const filteredProducts = getFilteredProducts();
  const itemCount = cartItems.reduce((s, i) => s + i.quantity, 0);

  // F2 = focus search, F9 = checkout
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "F9" && cartItems.length > 0) { e.preventDefault(); setCheckoutModal(true); }
      if (e.key === "Escape") { setSearch(""); searchRef.current?.blur(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cartItems.length]);

  useEffect(() => { fetchProducts({ search: searchQuery, categoryId: selectedCategory }); }, [searchQuery, selectedCategory, activeBranch?.id]);

  return (
    <div className="flex h-full overflow-hidden bg-slate-100" dir={en ? "ltr" : "rtl"}>
      {/* ── LEFT: PRODUCTS ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search & Filter Bar */}
        <div className="bg-white border-b border-slate-200 p-3 space-y-2 shrink-0">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={searchRef} value={searchQuery} onChange={(e) => setSearch(e.target.value)}
              placeholder={t("بحث بالاسم أو SKU أو الباركود... (F2)", "Search by name, SKU or barcode... (F2)")}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pr-9 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-all"
            />
            {searchQuery && <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>}
          </div>
          {/* Category tabs */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            <button onClick={() => setCategory(null)} className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${!selectedCategory ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{t("الكل", "All")}</button>
            {categories.map((c) => (
              <button key={c.id} onClick={() => setCategory(selectedCategory === c.id ? null : c.id)} className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${selectedCategory === c.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {c.icon} {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Count */}
        <div className="px-4 py-2 text-xs text-slate-400 shrink-0">{filteredProducts.length} {t("منتج", "products")}</div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Package className="w-16 h-16 mb-3 opacity-20" />
              <p className="text-lg font-medium">{t("لا توجد منتجات", "No products found")}</p>
              <p className="text-sm mt-1">{t("جرب بحثاً مختلفاً", "Try another search")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredProducts.map((p) => <ProductCard key={p.id} product={p} stock={getStock(p.id)} onAdd={addToCart} />)}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: CART ── */}
      <div className="w-80 xl:w-96 flex flex-col bg-white border-r border-slate-200 shadow-2xl shrink-0">
        {/* Cart header */}
        <div className="px-4 py-3 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-indigo-600" />
            <span className="font-bold text-slate-800">{t("السلة", "Cart")}</span>
            {cartItems.length > 0 && <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">{itemCount}</span>}
          </div>
          {cartItems.length > 0 && (
            <button onClick={async () => { if (await confirm(t("سيتم حذف جميع الأصناف من السلة الحالية.", "All items will be removed from the current cart."), { title: t("مسح سلة البيع", "Clear sales cart"), danger: true, confirmLabel: t("مسح السلة", "Clear cart") })) clearCart(); }} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Customer */}
        <div className="px-4 py-2 border-b shrink-0">
          {cartCustomer ? (
            <div className="flex items-center gap-2 bg-indigo-50 px-3 py-2 rounded-xl">
              <div className="w-7 h-7 bg-indigo-200 rounded-full flex items-center justify-center text-indigo-700 text-xs font-bold">{cartCustomer.name.slice(0, 2)}</div>
              <span className="text-sm font-medium text-indigo-700 flex-1 truncate">{cartCustomer.name}</span>
              <button onClick={clearCustomer} className="text-indigo-400 hover:text-indigo-600"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <button onClick={() => setCustomerModal(true)} className="w-full flex items-center gap-2 border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 px-3 py-2 rounded-xl text-sm transition-colors">
              <User className="w-4 h-4" /> إضافة عميل (F4)
            </button>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cartItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-300">
              <ShoppingCart className="w-14 h-14 mb-3" />
              <p className="text-sm font-medium">{t("السلة فارغة", "Cart is empty")}</p>
              <p className="text-xs mt-1">{t("اضغط على المنتجات للإضافة", "Select products to add them")}</p>
            </div>
          ) : (
            cartItems.map((item) => <CartItem key={item.id} item={item} />)
          )}
        </div>

        {/* Discount & Tax */}
        {cartItems.length > 0 && (
          <div className="px-4 py-3 border-t shrink-0 grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500">{t("خصم (مبلغ)", "Discount (amount)")}</label>
              <input type="number" value={cartDiscount || ""} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} placeholder="0" className="w-full border rounded-lg px-2 py-1.5 text-sm mt-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" min={0} />
            </div>
            <div>
              <label className="text-xs text-slate-500">{t("ضريبة %", "Tax %")}</label>
              <input type="number" value={cartTaxRate || ""} onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)} placeholder="0" className="w-full border rounded-lg px-2 py-1.5 text-sm mt-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" min={0} max={100} />
            </div>
          </div>
        )}

        {/* Totals + Checkout */}
        {cartItems.length > 0 && (
          <div className="px-4 pb-4 border-t pt-3 shrink-0 space-y-3">
            <div className="bg-slate-50 rounded-xl p-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600"><span>{t("المجموع الفرعي", "Subtotal")}</span><span>{totals.subtotal.toFixed(2)} ج</span></div>
              {cartDiscount > 0 && <div className="flex justify-between text-green-600"><span>خصم</span><span>−{parseFloat(cartDiscount).toFixed(2)} ج</span></div>}
              {cartTaxRate > 0 && <div className="flex justify-between text-slate-600"><span>ضريبة</span><span>{totals.taxAmount.toFixed(2)} ج</span></div>}
              <div className="border-t pt-2 flex justify-between font-bold text-base">
                <span>{t("الإجمالي", "Total")}</span>
                <span className="text-indigo-600">{totals.total.toFixed(2)} ج</span>
              </div>
            </div>
            <button onClick={() => setCheckoutModal(true)} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl text-base flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 transition-colors">
              <CheckCircle2 className="w-5 h-5" /> إتمام البيع (F9)
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {customerModal && <CustomerModal onClose={() => setCustomerModal(false)} onSelect={(c) => { setCustomer(c); setCustomerModal(false); }} />}
      {checkoutModal && <CheckoutModal onClose={() => setCheckoutModal(false)} />}
    </div>
  );
}