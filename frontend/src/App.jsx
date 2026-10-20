import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, useStore } from "./store/index.js";
import toast from "react-hot-toast";
import { LockKeyhole, RefreshCw } from "lucide-react";
import Login from "./views/Login.jsx";
import Layout from "./views/Layout.jsx";
import Dashboard from "./views/Dashboard.jsx";
import POS from "./views/POS.jsx";
import Inventory from "./views/Inventory.jsx";
import Sales from "./views/Sales.jsx";
import Customers from "./views/Customers.jsx";
import Repairs from "./views/Repairs.jsx";
import Transfers from "./views/Transfers.jsx";
import Expenses from "./views/Expenses.jsx";
import Users from "./views/Users.jsx";
import Branches from "./views/Branches.jsx";
import Finance from "./views/Finance.jsx";
import Returns from "./views/Returns.jsx";
import StockLedger from "./views/StockLedger.jsx";
import Purchases from "./views/Purchases.jsx";
import Receivables from "./views/Receivables.jsx";
import Approvals from "./views/Approvals.jsx";
import Growth from "./views/Growth.jsx";
import Closing from "./views/Closing.jsx";
import Tools from "./views/Tools.jsx";
import Reports from "./views/Reports.jsx";
import Settings from "./views/Settings.jsx";
import Stocktake from "./views/Stocktake.jsx";
import SyncCenter from "./views/SyncCenter.jsx";

function CashierShiftGate({ children }) {
  const user = useStore((state) => state.user);
  const activeBranch = useStore((state) => state.activeBranch);
  const language = useStore((state) => state.language);
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;
  const [shift, setShift] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [opening, setOpening] = useState("0");
  const [actual, setActual] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const cashier = user?.role === "CASHIER";
  const refresh = async () => {
    if (!cashier || !activeBranch?.id) { setShift(null); setLoading(false); return; }
    setLoading(true);
    try {
      const result = await Promise.all([api.get("/finance/shifts/current"), api.get("/finance/accounts")]);
      setShift(result[0].data || null);
      const active = (result[1].data || []).filter((a) => a.isActive !== false);
      setAccounts(active);
      setAccountId((old) => active.some((a) => a.id === old) ? old : (active.find((a) => a.type === "CASHBOX")?.id || active[0]?.id || ""));
    } catch (e) { toast.error(e.response?.data?.error || t("تعذر التحقق من الوردية", "Could not check shift status")); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, [user?.id, user?.role, activeBranch?.id]);
  const openShift = async () => {
    const amount = Number(opening);
    if (!Number.isFinite(amount) || amount < 0 || !accountId) { toast.error(t("راجع حساب الخزنة ورصيد البداية", "Check the cash account and opening balance")); return; }
    setSaving(true);
    try { const r = await api.post("/finance/shifts/open", { accountId, openingBalance: amount }); setShift(r.data); setOpening("0"); toast.success(t("تم فتح الوردية", "Shift opened")); }
    catch (e) { await refresh(); toast.error(e.response?.data?.error || t("تعذر فتح الوردية", "Could not open shift")); }
    finally { setSaving(false); }
  };
  const closeShift = async () => {
    const amount = Number(actual);
    if (actual.trim() === "" || !Number.isFinite(amount) || amount < 0 || !shift?.id) { toast.error(t("أدخل النقد الفعلي بشكل صحيح", "Enter a valid actual cash amount")); return; }
    setSaving(true);
    try { await api.post("/finance/shifts/" + shift.id + "/close", { actualBalance: amount, accountId }); setShift(null); setClosing(false); setActual(""); toast.success(t("تم إغلاق الوردية", "Shift closed")); }
    catch (e) { toast.error(e.response?.data?.error || t("تعذر إغلاق الوردية", "Could not close shift")); }
    finally { setSaving(false); }
  };
  if (!cashier) return children;
  if (loading) return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60"><RefreshCw className="h-8 w-8 animate-spin text-white" /></div>;
  return <>
    {children}
    {shift && <button onClick={() => setClosing(true)} className="fixed bottom-5 right-5 z-[80] flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-3 text-sm font-bold text-emerald-700 shadow-lg"><LockKeyhole className="h-4 w-4" />{t("الوردية مفتوحة · إغلاق", "Shift open · Close")}</button>}
    {!shift && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" dir={en ? "ltr" : "rtl"}><section className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><LockKeyhole className="h-7 w-7" /></div>
      <h2 className="text-center text-xl font-extrabold">{t("افتح ورديتك للبدء", "Open your shift to continue")}</h2>
      <p className="mt-2 text-center text-sm leading-6 text-slate-500">{t("يجب فتح وردية قبل استخدام نقطة البيع. سجّل رصيد النقد الفعلي الموجود في بداية العمل.", "You must open a shift before using the POS. Enter the actual opening cash amount.")}</p>
      <label className="mt-5 block text-sm font-semibold">{t("حساب الخزنة", "Cash account")}<select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-3"><option value="">{t("اختر حسابًا", "Select an account")}</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.type}</option>)}</select></label>
      <label className="mt-4 block text-sm font-semibold">{t("رصيد بداية الوردية", "Opening cash")}<input type="number" min="0" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-3" /></label>
      <button disabled={saving || !accountId} onClick={openShift} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white disabled:opacity-50">{saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}{t("فتح الوردية والدخول", "Open shift and continue")}</button>
      {!accounts.length && <p className="mt-3 text-xs text-rose-600">{t("لا توجد حسابات مالية فعالة أو تعذر تحميلها. أعد المحاولة أو تواصل مع المدير.", "No active financial accounts or loading failed. Retry or contact your manager.")}</p>}
      <div className="mt-3 flex gap-2"><button onClick={refresh} disabled={loading || saving} className="flex-1 rounded-xl border px-4 py-2 font-semibold disabled:opacity-50">{t("إعادة المحاولة", "Retry")}</button><button onClick={() => useStore.getState().logout()} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">{t("تسجيل الخروج", "Sign out")}</button></div>
    </section></div>}
    {shift && closing && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4" dir={en ? "ltr" : "rtl"}><section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><h2 className="text-xl font-extrabold">{t("إغلاق وردية الكاشير", "Close cashier shift")}</h2><p className="mt-2 text-sm text-slate-500">{t("أدخل النقد الفعلي بعد العد. سيحفظ النظام الرصيد المتوقع والفرق.", "Enter the counted cash. The system will save the expected balance and variance.")}</p><label className="mt-4 block text-sm font-semibold">{t("النقد الفعلي", "Actual cash")}<input type="number" min="0" step="0.01" value={actual} onChange={(e) => setActual(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-3" /></label><div className="mt-5 flex gap-2"><button disabled={saving} onClick={closeShift} className="flex-1 rounded-xl bg-slate-900 px-4 py-3 font-bold text-white disabled:opacity-50">{t("تأكيد الإغلاق", "Confirm close")}</button><button disabled={saving} onClick={() => setClosing(false)} className="rounded-xl border px-4 py-3">{t("رجوع", "Back")}</button></div></section></div>}
  </>;
}
function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user } = useStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) return <Navigate to="/dashboard" replace />;
  return children;
}
const guard = (element, roles) => <ProtectedRoute roles={roles}>{element}</ProtectedRoute>;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={guard(<CashierShiftGate><Layout /></CashierShiftGate>)}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="pos" element={guard(<POS />, ["SUPER_ADMIN","BRANCH_MANAGER","CASHIER"])} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="stock-ledger" element={<StockLedger />} />
        <Route path="purchases" element={guard(<Purchases />, ["SUPER_ADMIN","BRANCH_MANAGER","INVENTORY_MANAGER","ACCOUNTANT"])} />
        <Route path="receivables" element={guard(<Receivables />, ["SUPER_ADMIN","BRANCH_MANAGER","CASHIER","ACCOUNTANT"])} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="growth" element={<Growth />} />
        <Route path="closing" element={guard(<Closing />, ["SUPER_ADMIN","BRANCH_MANAGER","ACCOUNTANT"])} />
        <Route path="tools" element={guard(<Tools />, ["SUPER_ADMIN","BRANCH_MANAGER","INVENTORY_MANAGER"])} />
        <Route path="sync" element={<SyncCenter />} />
        <Route path="stocktake" element={guard(<Stocktake />, ["SUPER_ADMIN","BRANCH_MANAGER","INVENTORY_MANAGER"])} />
        <Route path="reports" element={guard(<Reports />, ["SUPER_ADMIN","BRANCH_MANAGER","ACCOUNTANT"])} />
        <Route path="settings" element={guard(<Settings />, ["SUPER_ADMIN","BRANCH_MANAGER"])} />
        <Route path="sales" element={<Sales />} />
        <Route path="customers" element={<Customers />} />
        <Route path="repairs" element={<Repairs />} />
        <Route path="transfers" element={<Transfers />} />
        <Route path="expenses" element={guard(<Expenses />, ["SUPER_ADMIN","BRANCH_MANAGER","ACCOUNTANT"])} />
        <Route path="finance" element={guard(<Finance />, ["SUPER_ADMIN","BRANCH_MANAGER","CASHIER","ACCOUNTANT"])} />
        <Route path="returns" element={guard(<Returns />, ["SUPER_ADMIN","BRANCH_MANAGER","CASHIER","ACCOUNTANT"])} />
        <Route path="users" element={guard(<Users />, ["SUPER_ADMIN","BRANCH_MANAGER"])} />
        <Route path="branches" element={guard(<Branches />, ["SUPER_ADMIN"])} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
