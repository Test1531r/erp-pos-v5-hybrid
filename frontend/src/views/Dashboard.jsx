import { useEffect, useState } from "react";
import { useStore } from "../store/index.js";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { TrendingUp, ShoppingBag, Users, Wrench, AlertTriangle, DollarSign, Package, RefreshCw } from "lucide-react";

function StatCard({ title, value, sub, icon: Icon, color, bg }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-center gap-4">
      <div className={`w-14 h-14 ${bg} rounded-xl flex items-center justify-center shrink-0`}>
        <Icon className={`w-7 h-7 ${color}`} />
      </div>
      <div>
        <p className="text-slate-500 text-sm">{title}</p>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const STATUS_AR = { RECEIVED: "مستلم", DIAGNOSING: "تشخيص", UNDER_REPAIR: "قيد الإصلاح", WAITING_PARTS: "انتظار قطع", COMPLETED: "مكتمل", DELIVERED: "تم التسليم" };

export default function Dashboard() {
  const { dashboard, fetchDashboard, language } = useStore();
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;
  const [loading, setLoading] = useState(false);

  const refresh = async () => { setLoading(true); await fetchDashboard(); setLoading(false); };
  useEffect(() => { fetchDashboard(); }, []);

  if (!dashboard) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-2" />
        <p className="text-slate-500">{t("جاري التحميل...", "Loading dashboard...")}</p>
      </div>
    </div>
  );

  const { today, month, pendingRepairs, totalCustomers, lowStockCount, lowStockItems, recentSales, repairsByStatus, topProducts, salesTrend, receivables, supplierDue, inventoryValue, accounts } = dashboard;

  return (
    <div dir={en ? "ltr" : "rtl"} className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{t("لوحة التحكم", "Dashboard")}</h2>
          <p className="text-slate-500 text-sm mt-1">{new Date().toLocaleDateString(en ? "en-US" : "ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
        <button onClick={refresh} disabled={loading} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> {t("تحديث", "Refresh")}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("مبيعات اليوم", "Today’s Sales")} value={`${(today?.revenue || 0).toLocaleString()} ج`} sub={`${today?.count || 0} فاتورة`} icon={DollarSign} color="text-green-600" bg="bg-green-100" />
        <StatCard title={t("مبيعات الشهر", "Monthly Sales")} value={`${(month?.revenue || 0).toLocaleString()} ج`} sub={`صافي الربح: ${(month?.netProfit || 0).toLocaleString()} ج`} icon={TrendingUp} color="text-indigo-600" bg="bg-indigo-100" />
        <StatCard title="الصيانة المعلقة" value={pendingRepairs || 0} sub="تحتاج متابعة" icon={Wrench} color="text-orange-600" bg="bg-orange-100" />
        <StatCard title={t("إجمالي العملاء", "Total customers")} value={totalCustomers || 0} icon={Users} color="text-blue-600" bg="bg-blue-100" />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="مخزون منخفض" value={lowStockCount || 0} sub="منتجات تحتاج تجديد" icon={AlertTriangle} color="text-red-600" bg="bg-red-100" />
        <StatCard title="صافي الشهر" value={`${(month?.netProfit || 0).toLocaleString()} ج`} sub={`إجمالي الربح: ${(month?.grossProfit || 0).toLocaleString()} ج`} icon={ShoppingBag} color="text-purple-600" bg="bg-purple-100" />
        <StatCard title="مديونيات العملاء" value={`${(receivables?.amount || 0).toLocaleString()} ج`} sub={`${receivables?.count || 0} حساب مفتوح`} icon={Users} color="text-amber-600" bg="bg-amber-100" />
        <StatCard title={t("قيمة المخزون", "Inventory value")} value={`${(inventoryValue || 0).toLocaleString()} ج`} sub={`مستحق الموردين: ${(supplierDue || 0).toLocaleString()} ج`} icon={Package} color="text-cyan-600" bg="bg-cyan-100" />
      </div>

      {accounts?.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-3">أرصدة الخزن والمحافظ</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {accounts.map((a) => <div key={a.id} className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-500">{a.name}</p><p className="text-lg font-bold text-slate-800">{Number(a.balance || 0).toLocaleString()} ج</p><p className="text-[10px] text-slate-400">{a.type}</p></div>)}
          </div>
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Trend */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-4">مبيعات آخر 7 أيام</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={salesTrend || []}>
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => [`${v.toLocaleString()} ج`, "الإيراد"]} />
              <Bar dataKey="revenue" fill="#6366f1" radius={[6, 6, 0, 0]}>
                {(salesTrend || []).map((_, i) => <Cell key={i} fill={i === 6 ? "#4f46e5" : "#a5b4fc"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-4">الأكثر مبيعاً</h3>
          <div className="space-y-3">
            {(topProducts || []).slice(0, 5).map((p, i) => (
              <div key={p.productId} className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${i === 0 ? "bg-yellow-500" : i === 1 ? "bg-slate-400" : "bg-orange-400"}`}>{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{p.productName}</p>
                  <p className="text-xs text-slate-400">{parseFloat(p._sum?.lineTotal || 0).toLocaleString()} ج</p>
                </div>
                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">×{p._sum?.quantity || 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sales */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-4">{t("آخر المبيعات", "Recent sales")}</h3>
          <div className="space-y-2">
            {(recentSales || []).map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 text-xs font-bold shrink-0">
                  {inv._count?.items || 0}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 font-mono truncate">{inv.invoiceNumber}</p>
                  <p className="text-xs text-slate-400">{inv.customer?.name || "عميل عادي"} • {new Date(inv.createdAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <span className="text-sm font-bold text-green-600">{parseFloat(inv.total).toLocaleString()} ج</span>
              </div>
            ))}
          </div>
        </div>

        {/* Low Stock */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" /> مخزون منخفض
          </h3>
          <div className="space-y-2">
            {(lowStockItems || []).slice(0, 6).map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                <Package className="w-5 h-5 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{inv.product.name}</p>
                  <p className="text-xs text-slate-400">{inv.product.sku}</p>
                </div>
                <div className="text-left">
                  <span className={`text-sm font-bold ${inv.quantity === 0 ? "text-red-600" : "text-orange-600"}`}>{inv.quantity}</span>
                  <span className="text-xs text-slate-400"> / {inv.product.lowStockQty}</span>
                </div>
              </div>
            ))}
            {(!lowStockItems || lowStockItems.length === 0) && <p className="text-slate-400 text-sm text-center py-4">✅ المخزون بحالة جيدة</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
