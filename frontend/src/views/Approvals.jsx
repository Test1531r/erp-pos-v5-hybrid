import { useEffect, useState } from "react";
import { api, useStore } from "../store/index.js";
import { ShieldCheck, Check, X, RefreshCw, Clock3, UserRound, BadgePercent, MessageSquareText, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

const statusLabel = { PENDING: "بانتظار الموافقة", APPROVED: "تمت الموافقة", REJECTED: "مرفوض" };
const typeLabel = { DISCOUNT: "خصم على فاتورة", EXPENSE: "مصروف", TRANSFER: "تحويل مخزون" };
const statusLabelEn = { PENDING: "Pending approval", APPROVED: "Approved", REJECTED: "Rejected" };
const typeLabelEn = { DISCOUNT: "Invoice discount", EXPENSE: "Expense", TRANSFER: "Stock transfer" };
const fmt = v => Number(v || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Approvals() {
  const language = useStore((state) => state.language);
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;
  const activeBranch = useStore(s => s.activeBranch);
  const user = useStore(s => s.user);
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("PENDING");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [decisionDraft, setDecisionDraft] = useState(null);
  const [decisionNotes, setDecisionNotes] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/approvals", { params: status === "ALL" ? {} : { status } });
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(e.response?.data?.error || "تعذر تحميل الموافقات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (activeBranch?.id) load(); }, [activeBranch?.id, status]);

  const openDecision = (row, decision) => {
    setDecisionNotes("");
    setDecisionDraft({ id: row.id, decision, title: decision === "APPROVED" ? "تأكيد اعتماد الطلب" : "تأكيد رفض الطلب" });
  };

  const decide = async () => {
    if (!decisionDraft) return;
    const { id, decision } = decisionDraft;
    setBusyId(id);
    try {
      await api.post(`/approvals/${id}/decision`, { decision, notes: decisionNotes.trim() });
      toast.success(decision === "APPROVED" ? "تم اعتماد الطلب بنجاح" : "تم رفض الطلب");
      setDecisionDraft(null);
      setDecisionNotes("");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.error || "تعذر تسجيل القرار");
    } finally {
      setBusyId("");
    }
  };

  const canDecide = ["SUPER_ADMIN", "BRANCH_MANAGER"].includes(user?.role);

  return (
    <div className="p-4 md:p-6 space-y-5" dir={en ? "ltr" : "rtl"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="text-indigo-600" />{t("مركز الموافقات", "Approvals center")}</h1>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50" aria-label="تحديث">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          <span className="text-sm">{t("تحديث", "Refresh")}</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[[ "PENDING", "بانتظار الموافقة" ], [ "APPROVED", "المعتمدة" ], [ "REJECTED", "المرفوضة" ], [ "ALL", "الكل" ]].map(([value, label]) =>
          <button key={value} onClick={() => setStatus(value)} className={`rounded-xl px-4 py-2 text-sm font-semibold border transition-colors ${status === value ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{label}</button>
        )}
      </div>

      <div className="grid gap-3">
        {rows.map(r => {
          const isDiscount = r.entityType === "DISCOUNT" && r.action === "APPROVE_DISCOUNT";
          return (
            <article key={r.id} className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 space-y-3 shadow-sm">
              <div className="flex flex-wrap items-start gap-3">
                <div className="rounded-xl bg-indigo-50 text-indigo-600 p-3">{isDiscount ? <BadgePercent className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800">{isDiscount ? "طلب اعتماد خصم" : (typeLabel[r.entityType] || r.entityType)}{!isDiscount && r.action ? ` — ${r.action}` : ""}</p>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><UserRound className="w-3 h-3" />{r.requestedBy?.name || "مستخدم"}{r.requestedBy?.role ? ` • ${r.requestedBy.role}` : ""}</p>
                  {r.reason && <p className="text-sm mt-2 text-slate-700">{r.reason}</p>}
                  {isDiscount && <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    <div className="bg-amber-50 rounded-lg p-3"><span className="text-slate-500 block text-xs">{t("الخصم المطلوب", "Requested discount")}</span><b>{fmt(r.payload?.discountAmount ?? r.amount)} ج</b></div>
                    <div className="bg-slate-50 rounded-lg p-3"><span className="text-slate-500 block text-xs">{t("إجمالي الأصناف", "Items subtotal")}</span><b>{fmt(r.payload?.subtotal)} ج</b></div>
                    <div className="bg-slate-50 rounded-lg p-3"><span className="text-slate-500 block text-xs">{t("عدد الأصناف", "Item count")}</span><b>{Number(r.payload?.itemCount || 0)}</b></div>
                  </div>}
                  <p className="text-xs text-slate-400 mt-2 flex items-center gap-1"><Clock3 className="w-3 h-3" />{new Date(r.createdAt).toLocaleString("ar-SA")}</p>
                  {r.decisionNotes && <p className="text-sm mt-2 text-slate-600">ملاحظات القرار: {r.decisionNotes}</p>}
                </div>
                <span className={`px-2.5 py-1 text-xs rounded-full whitespace-nowrap ${r.status === "PENDING" ? "bg-amber-100 text-amber-700" : r.status === "APPROVED" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{statusLabel[r.status] || r.status}</span>
              </div>
              {canDecide && r.status === "PENDING" && <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button onClick={() => openDecision(r, "REJECTED")} disabled={busyId === r.id} className="px-4 py-2 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 flex items-center gap-2"><X className="w-4 h-4" />{t("رفض", "Reject")}</button>
                <button onClick={() => openDecision(r, "APPROVED")} disabled={busyId === r.id || r.requestedById === user?.id} title={r.requestedById === user?.id ? "لا يمكنك اعتماد طلبك الشخصي" : "اعتماد"} className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 flex items-center gap-2"><Check className="w-4 h-4" />{t("اعتماد", "Approve")}</button>
              </div>}
            </article>
          );
        })}
        {!rows.length && <div className="text-center bg-white border border-slate-200 rounded-2xl p-10 text-slate-400">{loading ? "جارٍ تحميل الطلبات..." : "لا توجد طلبات في هذا التصنيف."}</div>}
      </div>

      {decisionDraft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={e => { if (e.target === e.currentTarget && !busyId) setDecisionDraft(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="decision-title" className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-start gap-3 p-5 border-b border-slate-100">
            <div className={`rounded-xl p-2.5 ${decisionDraft.decision === "APPROVED" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {decisionDraft.decision === "APPROVED" ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            </div>
            <div className="flex-1">
              <h2 id="decision-title" className="font-bold text-lg text-slate-900">{decisionDraft.title}</h2>
              <p className="text-sm text-slate-500 mt-1">{decisionDraft.decision === "APPROVED" ? "سيتم تسجيل اعتماد الطلب في سجل النظام." : "سيتم تسجيل رفض الطلب في سجل النظام."}</p>
            </div>
            <button onClick={() => setDecisionDraft(null)} disabled={Boolean(busyId)} aria-label="إغلاق" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-50"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-5 space-y-2">
            <label htmlFor="decision-notes" className="text-sm font-semibold text-slate-700 flex items-center gap-2"><MessageSquareText className="w-4 h-4" />ملاحظات القرار <span className="font-normal text-slate-400">{t("(اختياري)", "(Optional)")}</span></label>
            <textarea id="decision-notes" value={decisionNotes} onChange={e => setDecisionNotes(e.target.value)} rows={3} maxLength={500} placeholder="أضف سببًا أو ملاحظة تساعد في توثيق القرار..." className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
          </div>
          <div className="flex gap-2 justify-end p-4 bg-slate-50 border-t border-slate-100">
            <button onClick={() => setDecisionDraft(null)} disabled={Boolean(busyId)} className="rounded-xl px-4 py-2.5 border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50">{t("إلغاء", "Cancel")}</button>
            <button onClick={decide} disabled={Boolean(busyId)} className={`rounded-xl px-4 py-2.5 font-semibold text-white disabled:opacity-60 ${decisionDraft.decision === "APPROVED" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>{busyId ? "جارٍ الحفظ..." : decisionDraft.decision === "APPROVED" ? "تأكيد الاعتماد" : "تأكيد الرفض"}</button>
          </div>
        </section>
      </div>}
    </div>
  );
}
