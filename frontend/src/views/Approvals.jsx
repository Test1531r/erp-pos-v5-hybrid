import { useEffect, useState } from "react";
import { api, useStore } from "../store/index.js";
import { ShieldCheck, Check, X, RefreshCw, Clock3, UserRound, BadgePercent } from "lucide-react";
import toast from "react-hot-toast";

const statusLabel = { PENDING: "بانتظار الموافقة", APPROVED: "تمت الموافقة", REJECTED: "مرفوض" };
const typeLabel = { DISCOUNT: "خصم على فاتورة", EXPENSE: "مصروف", TRANSFER: "تحويل مخزون" };
const fmt = v => Number(v || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Approvals() {
  const activeBranch = useStore(s => s.activeBranch);
  const user = useStore(s => s.user);
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("PENDING");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");

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

  const decide = async (id, decision) => {
    const notes = window.prompt("ملاحظات القرار (اختياري)") || "";
    setBusyId(id);
    try {
      await api.post(`/approvals/${id}/decision`, { decision, notes });
      toast.success(decision === "APPROVED" ? "تم اعتماد الطلب" : "تم رفض الطلب");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.error || "تعذر تسجيل القرار");
    } finally {
      setBusyId("");
    }
  };

  const canDecide = ["SUPER_ADMIN", "BRANCH_MANAGER"].includes(user?.role);
  const pendingCount = rows.filter(r => r.status === "PENDING").length;

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="text-indigo-600" />مركز الموافقات</h1>
          <p className="text-sm text-slate-500 mt-1">مراجعة الخصومات والمصروفات والطلبات التي تتطلب اعتمادًا إداريًا.</p>
        </div>
        <button onClick={load} disabled={loading} className="p-2 bg-white border rounded-xl disabled:opacity-50" aria-label="تحديث">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {[["PENDING", "بانتظار الموافقة"], ["APPROVED", "المعتمدة"], ["REJECTED", "المرفوضة"], ["ALL", "الكل"]].map(([value, label]) =>
          <button key={value} onClick={() => setStatus(value)} className={`rounded-xl px-4 py-2 text-sm font-semibold border ${status === value ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600"}`}>{label}</button>
        )}
      </div>
      <div className="grid gap-3">
        {rows.map(r => {
          const isDiscount = r.entityType === "DISCOUNT" && r.action === "APPROVE_DISCOUNT";
          return (
            <article key={r.id} className="bg-white rounded-2xl border p-4 md:p-5 space-y-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="rounded-xl bg-indigo-50 text-indigo-600 p-3">{isDiscount ? <BadgePercent className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold">{isDiscount ? "طلب اعتماد خصم" : (typeLabel[r.entityType] || r.entityType)}{!isDiscount && r.action ? ` — ${r.action}` : ""}</p>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><UserRound className="w-3 h-3" />{r.requestedBy?.name || "مستخدم"}{r.requestedBy?.role ? ` • ${r.requestedBy.role}` : ""}</p>
                  {r.reason && <p className="text-sm mt-2">{r.reason}</p>}
                  {isDiscount && <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    <div className="bg-amber-50 rounded-lg p-3"><span className="text-slate-500 block text-xs">الخصم المطلوب</span><b>{fmt(r.payload?.discountAmount ?? r.amount)} ج</b></div>
                    <div className="bg-slate-50 rounded-lg p-3"><span className="text-slate-500 block text-xs">إجمالي الأصناف</span><b>{fmt(r.payload?.subtotal)} ج</b></div>
                    <div className="bg-slate-50 rounded-lg p-3"><span className="text-slate-500 block text-xs">عدد الأصناف</span><b>{Number(r.payload?.itemCount || 0)}</b></div>
                  </div>}
                  <p className="text-xs text-slate-400 mt-2 flex items-center gap-1"><Clock3 className="w-3 h-3" />{new Date(r.createdAt).toLocaleString("ar-SA")}</p>
                  {r.decisionNotes && <p className="text-sm mt-2 text-slate-600">ملاحظات القرار: {r.decisionNotes}</p>}
                </div>
                <span className={`px-2.5 py-1 text-xs rounded-full whitespace-nowrap ${r.status === "PENDING" ? "bg-amber-100 text-amber-700" : r.status === "APPROVED" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{statusLabel[r.status] || r.status}</span>
              </div>
              {canDecide && r.status === "PENDING" && <div className="flex justify-end gap-2 border-t pt-3">
                <button onClick={() => decide(r.id, "REJECTED")} disabled={busyId === r.id} className="px-4 py-2 rounded-xl border border-red-200 text-red-700 disabled:opacity-50 flex items-center gap-2"><X className="w-4 h-4" />رفض</button>
                <button onClick={() => decide(r.id, "APPROVED")} disabled={busyId === r.id || r.requestedById === user?.id} title={r.requestedById === user?.id ? "لا يمكنك اعتماد طلبك الشخصي" : "اعتماد"} className="px-4 py-2 rounded-xl bg-green-600 text-white disabled:opacity-50 flex items-center gap-2"><Check className="w-4 h-4" />اعتماد</button>
              </div>}
            </article>
          );
        })}
        {!rows.length && <div className="text-center bg-white border rounded-2xl p-10 text-slate-400">{loading ? "جارٍ تحميل الطلبات..." : "لا توجد طلبات في هذا التصنيف."}</div>}
      </div>
    </div>
  );
}
