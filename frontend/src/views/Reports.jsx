import { useCallback, useEffect, useState } from "react";
import { api, useStore } from "../store/index.js";
import { BarChart3, RefreshCw, TrendingUp, Receipt, RotateCcw, Package, Wallet, CircleDollarSign, FileDown, GitCompareArrows } from "lucide-react";
import toast from "react-hot-toast";

const money = (value, locale) => Number(value || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDate = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const csvCell = value => {
  let text = String(value ?? "");
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
};
const Field = ({ label, children }) => <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">{label}{children}</label>;

export default function Reports() {
  const branch = useStore(s => s.activeBranch);
  const user = useStore(s => s.user);
  const language = useStore(s => s.language);
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;
  const locale = en ? "en-US" : "ar-EG";
  const now = new Date();
  const first = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(localDate(now));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [comparison, setComparison] = useState(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);

  const load = useCallback(async () => {
    if (!branch?.id) return;
    if (from > to) { toast.error(t("تاريخ البداية يجب أن يسبق تاريخ النهاية", "Start date must be before end date")); return; }
    setLoading(true);
    try {
      const response = await api.get(`/reports/profit-loss?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      setData(response.data);
    } catch (error) {
      toast.error(error.response?.data?.error || t("تعذر تحميل التقرير", "Could not load report"));
    } finally { setLoading(false); }
  }, [branch?.id, from, to, en]);

  useEffect(() => { load(); }, [load]);

  const loadComparison = useCallback(async () => {
    if (user?.role !== "SUPER_ADMIN") return;
    setComparisonLoading(true);
    try {
      const response = await api.get(`/reports/branch-comparison?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      setComparison(response.data);
    } catch (error) {
      setComparison(null);
      toast.error(error.response?.data?.error || t("تعذر تحميل مقارنة الفروع", "Could not load branch comparison"));
    } finally { setComparisonLoading(false); }
  }, [user?.role, from, to, en]);

  useEffect(() => { if (user?.role === "SUPER_ADMIN") loadComparison(); }, [loadComparison, user?.role]);

  const exportComparison = () => {
    if (!comparison?.branches?.length) return;
    const cell = value => {
      let text = String(value ?? "");
      if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const rows = [
      [t("مقارنة الفروع", "Branch comparison")],
      [t("من تاريخ", "From"), from],
      [t("إلى تاريخ", "To"), to],
      [],
      [t("الفرع", "Branch"), t("كود الفرع", "Branch code"), t("المبيعات", "Sales"), t("المرتجعات", "Returns"), t("صافي المبيعات", "Net sales"), t("تكلفة البضاعة", "COGS"), t("المصروفات", "Expenses"), t("صافي الربح التقديري", "Estimated net profit"), t("عدد الفواتير", "Invoice count"), t("المشتريات", "Purchases"), t("المدفوع للموردين", "Paid to suppliers")],
      ...comparison.branches.map(row => [row.branchName, row.branchCode, row.revenue, row.returns, row.netSales, row.cogs, row.expenses, row.netProfit, row.invoiceCount, row.purchases, row.purchasePaid])
    ];
    const csv = "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `branch-comparison-${from}-to-${to}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const fmt = value => money(value, locale);
  const exportCsv = () => {
    if (!data) return;
    const rows = [
      [t("تقرير الأرباح والخسائر", "Profit and loss report")],
      [t("الفرع", "Branch"), branch?.name || ""],
      [t("من تاريخ", "From"), from],
      [t("إلى تاريخ", "To"), to],
      [],
      [t("المؤشر", "Metric"), t("القيمة", "Value")],
      [t("إجمالي المبيعات", "Gross sales"), Number(data.revenue || 0)],
      [t("المرتجعات", "Returns"), Number(data.returns || 0)],
      [t("صافي المبيعات", "Net sales"), Number(data.netSales || 0)],
      [t("تكلفة البضاعة", "Cost of goods sold"), Number(data.cogs || 0)],
      [t("إجمالي الربح", "Gross profit"), Number(data.grossProfit || 0)],
      [t("المصروفات", "Expenses"), Number(data.expenses || 0)],
      [t("صافي الربح", "Net profit"), Number(data.netProfit || 0)],
      [t("المشتريات", "Purchases"), Number(data.purchases || 0)],
      [t("المدفوع للموردين", "Paid to suppliers"), Number(data.purchasePaid || 0)],
      [t("عدد الفواتير", "Invoice count"), Number(data.invoiceCount || 0)],
      [t("الخصومات", "Discounts"), Number(data.discount || 0)],
      [t("الضرائب", "Tax"), Number(data.tax || 0)],
    ];
    const csv = "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `profit-loss-${from}-to-${to}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };
  const card = (title, value, sub, Icon, tone) => (
    <div key={title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3"><p className="text-sm text-slate-500">{title}</p><span className={`rounded-xl p-2 ${tone}`}><Icon className="h-5 w-5"/></span></div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{fmt(value)}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );

  return <div dir={en ? "ltr" : "rtl"} className="space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><BarChart3 className="h-6 w-6 text-indigo-600"/>{t("تقارير الإدارة","Management reports")}</h1><p className="mt-1 text-sm text-slate-500">{t("تحليل الأرباح والخسائر وتكلفة البضاعة والمرتجعات والمصروفات","Profit and loss, cost of goods, returns and expenses")}</p></div>
      <div className="flex flex-wrap gap-2">
        <button disabled={!data || loading} onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><FileDown className="h-4 w-4"/>{t("تصدير CSV / Excel","Export CSV / Excel")}</button>
        <button disabled={loading} onClick={load} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/>{t("تحديث التقرير","Refresh report")}</button>
      </div>
    </header>
    <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <Field label={t("من تاريخ","From date")}><input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"/></Field>
      <Field label={t("إلى تاريخ","To date")}><input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"/></Field>
      <p className="pb-2 text-xs text-slate-400">{t("يتم احتساب التقرير وفق الفترة والفرع المحددين.","Report reflects the selected period and branch.")}</p>
    </section>
    {user?.role === "SUPER_ADMIN" && (
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><GitCompareArrows className="h-5 w-5 text-indigo-600"/>{t("مقارنة الفروع", "Branch comparison")}</h2>
            <p className="mt-1 text-xs text-slate-500">{t("مقارنة المؤشرات للفترة المختارة. صافي الربح تقديري وفق تكلفة البضاعة المسجلة والمصروفات المسجلة.", "Compare metrics for the selected period. Net profit is an estimate based on recorded COGS and expenses.")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={!comparison?.branches?.length || comparisonLoading} onClick={exportComparison} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"><FileDown className="mr-1 inline h-4 w-4"/>{t("تصدير CSV / Excel", "Export CSV / Excel")}</button>
            <button disabled={comparisonLoading} onClick={loadComparison} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"><RefreshCw className={`mr-1 inline h-4 w-4 ${comparisonLoading ? "animate-spin" : ""}`}/>{t("تحديث المقارنة", "Refresh comparison")}</button>
          </div>
        </div>
        {comparisonLoading && !comparison ? <p className="p-6 text-sm text-slate-500">{t("جارٍ تحميل مقارنة الفروع...", "Loading branch comparison...")}</p> :
          comparison?.branches?.length ? <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-xs text-slate-500">
              <th className="whitespace-nowrap px-3 py-3">{t("الفرع", "Branch")}</th>
              <th className="whitespace-nowrap px-3 py-3">{t("المبيعات", "Sales")}</th>
              <th className="whitespace-nowrap px-3 py-3">{t("المرتجعات", "Returns")}</th>
              <th className="whitespace-nowrap px-3 py-3">{t("صافي المبيعات", "Net sales")}</th>
              <th className="whitespace-nowrap px-3 py-3">{t("تكلفة البضاعة", "COGS")}</th>
              <th className="whitespace-nowrap px-3 py-3">{t("المصروفات", "Expenses")}</th>
              <th className="whitespace-nowrap px-3 py-3">{t("صافي الربح التقديري", "Est. net profit")}</th>
              <th className="whitespace-nowrap px-3 py-3">{t("الفواتير", "Invoices")}</th>
            </tr></thead>
            <tbody>{comparison.branches.map((row) => <tr key={row.branchId} className="border-t border-slate-100">
              <td className="whitespace-nowrap px-3 py-3"><b>{row.branchName}</b><div className="text-xs text-slate-400">{row.branchCode}</div></td>
              <td className="whitespace-nowrap px-3 py-3">{fmt(row.revenue)}</td>
              <td className="whitespace-nowrap px-3 py-3">{fmt(row.returns)}</td>
              <td className="whitespace-nowrap px-3 py-3 font-semibold">{fmt(row.netSales)}</td>
              <td className="whitespace-nowrap px-3 py-3">{fmt(row.cogs)}</td>
              <td className="whitespace-nowrap px-3 py-3">{fmt(row.expenses)}</td>
              <td className={`whitespace-nowrap px-3 py-3 font-bold ${row.netProfit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{fmt(row.netProfit)}</td>
              <td className="whitespace-nowrap px-3 py-3">{row.invoiceCount}</td>
            </tr>)}</tbody>
          </table></div> : <p className="p-6 text-sm text-slate-500">{t("لا توجد فروع نشطة أو بيانات لهذه الفترة.", "No active branches or data for this period.")}</p>}
      </section>
    )}
    {!data && loading && <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">{t("جارٍ إعداد التقرير...","Preparing report...")}</div>}
    {data && <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {card(t("إجمالي المبيعات","Gross sales"),data.revenue,t(`${data.invoiceCount || 0} فاتورة`,`${data.invoiceCount || 0} invoices`),Receipt,"bg-indigo-50 text-indigo-700")}
        {card(t("المرتجعات","Returns"),data.returns,null,RotateCcw,"bg-red-50 text-red-700")}
        {card(t("صافي المبيعات","Net sales"),data.netSales,null,TrendingUp,"bg-blue-50 text-blue-700")}
        {card(t("تكلفة البضاعة","Cost of goods sold"),data.cogs,"COGS",Package,"bg-amber-50 text-amber-700")}
        {card(t("إجمالي الربح","Gross profit"),data.grossProfit,null,CircleDollarSign,"bg-emerald-50 text-emerald-700")}
        {card(t("المصروفات","Expenses"),data.expenses,null,Wallet,"bg-rose-50 text-rose-700")}
        {card(t("صافي الربح","Net profit"),data.netProfit,null,TrendingUp,data.netProfit>=0?"bg-emerald-50 text-emerald-700":"bg-red-50 text-red-700")}
        {card(t("المشتريات","Purchases"),data.purchases,t("المدفوع","Paid")+": "+fmt(data.purchasePaid),Package,"bg-slate-100 text-slate-700")}
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-slate-900">{t("ملخص الربحية","Profitability summary")}</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between gap-4"><span className="text-slate-600">{t("صافي المبيعات","Net sales")}</span><b>{fmt(data.netSales)}</b></div>
          <div className="flex justify-between gap-4"><span className="text-slate-600">{t("ناقص: تكلفة البضاعة","Less: cost of goods sold")}</span><b>{fmt(data.cogs)}</b></div>
          <div className="flex justify-between gap-4 border-t border-slate-100 pt-3 text-emerald-700"><span>{t("إجمالي الربح","Gross profit")}</span><b>{fmt(data.grossProfit)}</b></div>
          <div className="flex justify-between gap-4"><span className="text-slate-600">{t("ناقص: المصروفات التشغيلية","Less: operating expenses")}</span><b>{fmt(data.expenses)}</b></div>
          <div className="flex justify-between gap-4 border-t border-slate-200 pt-4 text-base"><span className="font-bold">{t("صافي الربح","Net profit")}</span><b className={data.netProfit>=0?"text-emerald-700":"text-red-700"}>{fmt(data.netProfit)}</b></div>
        </div>
      </section>
    </>}
  </div>;
}
