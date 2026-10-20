import { useEffect, useState } from "react";
import { api, useStore } from "../store/index.js";
import { Settings2, Save, ShieldCheck, ToggleLeft, ToggleRight, RefreshCw, Globe, Store, SlidersHorizontal } from "lucide-react";
import toast from "react-hot-toast";

const FEATURES = [
  ["dashboard","لوحة التحكم","Dashboard"],["pos","نقطة البيع","Point of Sale"],["inventory","المخزون والمنتجات","Inventory & Products"],
  ["stockLedger","حركة المخزون","Stock Ledger"],["purchases","المشتريات والموردون","Purchases & Suppliers"],
  ["receivables","الآجل والتحصيل","Receivables & Collections"],["installments","التقسيط","Installments"],
  ["approvals","مركز الموافقات","Approvals Center"],["growth","العروض والاستبدال","Promotions & Trade-In"],
  ["closing","الإقفال اليومي","Daily Closing"],["tools","الباركود والاستيراد","Barcode & Import"],
  ["stocktake","الجرد الدوري","Stocktake"],["reports","التقارير","Reports"],["sync","مركز المزامنة","Sync Center"],
  ["sales","المبيعات والفواتير","Sales & Invoices"],["customers","العملاء","Customers"],["repairs","الصيانة","Repairs"],
  ["transfers","تحويلات المخزون","Stock Transfers"],["expenses","المصروفات","Expenses"],["finance","المالية والمحافظ","Finance & Wallets"],
  ["returns","المرتجعات","Returns"],["users","إدارة المستخدمين","User Management"],["branches","إدارة الفروع","Branch Management"],
  ["loyalty","نظام الولاء","Loyalty Program"],["offlineMode","العمل دون اتصال","Offline Mode"]
];
const defaultFeatures = Object.fromEntries(FEATURES.map(([key])=>[key,true]));
const fieldClass = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
export default function Settings() {
  const branch=useStore(s=>s.activeBranch), user=useStore(s=>s.user), language=useStore(s=>s.language);
  const en=language==="en", t=(ar,english)=>en?english:ar;
  const [tab,setTab]=useState("branch"),[form,setForm]=useState(null),[features,setFeatures]=useState(defaultFeatures),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
  const isSuperAdmin=user?.role==="SUPER_ADMIN";
  useEffect(()=>{
    let alive=true;
    async()=>{
      setLoading(true);
      try{
        const requests=[api.get("/settings")];
        if(isSuperAdmin) requests.push(api.get("/settings/system"));
        const results=await Promise.all(requests);
        if(!alive)return;
        setForm(results[0].data);
        if(isSuperAdmin) setFeatures({...defaultFeatures,...(results[1].data.features||{})});
      }catch(e){if(alive)toast.error(e.response?.data?.error||t("تعذر تحميل الإعدادات","Could not load settings"));}
      finally{if(alive)setLoading(false);}
    }();
    return()=>{alive=false};
  },[branch?.id,isSuperAdmin]);
  const update=(key,value)=>setForm(old=>({...old,[key]:value}));
  const saveBranch=async()=>{setSaving(true);try{const {data}=await api.put("/settings",form);setForm(data);toast.success(t("تم حفظ إعدادات الفرع","Branch settings saved"));}catch(e){toast.error(e.response?.data?.error||t("تعذر الحفظ","Could not save settings"));}finally{setSaving(false)}};
  const saveFeatures=async()=>{setSaving(true);try{const {data}=await api.put("/settings/system",{features});setFeatures({...defaultFeatures,...data.features});toast.success(t("تم حفظ مميزات النظام","System feature settings saved"));}catch(e){toast.error(e.response?.data?.error||t("تعذر حفظ مميزات النظام","Could not save system features"));}finally{setSaving(false)}};
  const tabs=[["branch",Store,t("إعدادات الفرع","Branch settings")],...(isSuperAdmin?[["system",ShieldCheck,t("تحكم النظام","System control")]]:[])];
  if(loading||!form)return <div className="p-8 text-center text-slate-500">{t("جارٍ تحميل الإعدادات...","Loading settings...")}</div>;
  return <div className="p-4 md:p-6 space-y-5" dir={en?"ltr":"rtl"}>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Settings2 className="text-indigo-600"/>{t("الإعدادات","Settings")}</h1><p className="mt-1 text-sm text-slate-500">{t("إعدادات التشغيل والتحكم في مميزات النظام","Configure operations and control system features")}</p></div>
      <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700"><Globe className="h-4 w-4"/>{en?"English":"العربية"} · {isSuperAdmin?"SUPER ADMIN":t("مدير الفرع","Branch manager")}</span>
    </header>
    <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">{tabs.map(([id,Icon,label])=><button key={id} onClick={()=>setTab(id)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${tab===id?"bg-indigo-600 text-white shadow-sm":"border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}><Icon className="h-4 w-4"/>{label}</button>)}</div>
    {tab==="branch"&&<div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4"><h2 className="font-bold text-slate-900">{t("المبيعات والفاتورة","Sales & Invoice")}</h2>
          <label className="block text-sm font-medium">{t("العملة","Currency")}<input value={form.currency||""} maxLength={8} onChange={e=>update("currency",e.target.value)} className={fieldClass}/></label>
          <label className="block text-sm font-medium">{t("ضريبة القيمة المضافة %","VAT %")}<input type="number" min="0" max="100" value={form.vatRate??0} onChange={e=>update("vatRate",Number(e.target.value))} className={fieldClass}/></label>
          <label className="block text-sm font-medium">{t("مدة الإرجاع بالأيام","Return window (days)")}<input type="number" min="0" max="365" value={form.returnDays??7} onChange={e=>update("returnDays",Number(e.target.value))} className={fieldClass}/></label>
          <label className="block text-sm font-medium">{t("تذييل الفاتورة","Invoice footer")}<textarea rows={3} maxLength={1000} value={form.invoiceFooter||""} onChange={e=>update("invoiceFooter",e.target.value)} className={fieldClass}/></label>
          <label className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm"><input type="checkbox" checked={!!form.requireShiftForPOS} onChange={e=>update("requireShiftForPOS",e.target.checked)}/>{t("اشتراط فتح وردية قبل البيع","Require an open shift before sales")}</label>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4"><h2 className="font-bold text-slate-900">{t("الولاء والموافقات","Loyalty & Approvals")}</h2>
          <label className="block text-sm font-medium">{t("كل مبلغ يمنح نقاطًا","Amount per loyalty step")}<input type="number" min="0.01" value={form.loyaltyEarnPerAmount??100} onChange={e=>update("loyaltyEarnPerAmount",Number(e.target.value))} className={fieldClass}/></label>
          <label className="block text-sm font-medium">{t("عدد النقاط لكل خطوة","Points per step")}<input type="number" min="0" value={form.loyaltyPointsPerStep??1} onChange={e=>update("loyaltyPointsPerStep",Number(e.target.value))} className={fieldClass}/></label>
          <label className="block text-sm font-medium">{t("قيمة النقطة عند الاستبدال","Point redemption value")}<input type="number" min="0" value={form.loyaltyRedeemPointValue??0} onChange={e=>update("loyaltyRedeemPointValue",Number(e.target.value))} className={fieldClass}/></label>
          <label className="block text-sm font-medium">{t("حد المصروف الذي يتطلب موافقة","Expense approval threshold")}<input type="number" min="0" value={form.requireApprovalExpenseAbove??""} onChange={e=>update("requireApprovalExpenseAbove",e.target.value===""?"":Number(e.target.value))} className={fieldClass}/></label>
          <label className="block text-sm font-medium">{t("نسبة الخصم التي تتطلب موافقة %","Discount approval threshold %")}<input type="number" min="0" max="100" value={form.requireApprovalDiscountAbove??""} onChange={e=>update("requireApprovalDiscountAbove",e.target.value===""?"":Number(e.target.value))} className={fieldClass}/></label>
        </section>
      </div><div className="flex justify-end"><button disabled={saving} onClick={saveBranch} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"><Save className="h-4 w-4"/>{saving?t("جارٍ الحفظ...","Saving..."):t("حفظ إعدادات الفرع","Save branch settings")}</button></div>
    </div>}
    {tab==="system"&&isSuperAdmin&&<div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-amber-700"/><div><h2 className="font-bold text-amber-950">{t("تحكم السوبر أدمن في مميزات النظام","Super Admin feature control")}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-amber-900">{t("إيقاف ميزة يمنع الوصول إلى واجهات API المرتبطة بها لجميع المستخدمين. اترك الإعدادات متاحة دائمًا حتى تستطيع إعادة تشغيل المميزات. استخدم الإيقاف بحذر، خاصةً للعمليات المالية.","Disabling a feature blocks its mapped API routes for all users. Settings remain available so features can be re-enabled. Use care with financial and operational modules.")}</p></div></div><div className="flex gap-2"><button onClick={()=>setFeatures(Object.fromEntries(FEATURES.map(([k])=>[k,true])))} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold">{t("تشغيل الكل","Enable all")}</button><button onClick={()=>setFeatures(Object.fromEntries(FEATURES.map(([k])=>[k,false])))} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold">{t("إيقاف الكل","Disable all")}</button></div></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{FEATURES.map(([key,ar,english])=>{const enabled=features[key]!==false;return <button key={key} onClick={()=>setFeatures(old=>({...old,[key]:!enabled}))} aria-pressed={enabled} className={`flex items-center gap-3 rounded-2xl border p-4 text-start transition hover:shadow-sm ${enabled?"border-emerald-200 bg-white":"border-slate-200 bg-slate-50"}`}><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${enabled?"bg-emerald-50 text-emerald-700":"bg-slate-200 text-slate-500"}`}>{enabled?<ToggleRight className="h-6 w-6"/>:<ToggleLeft className="h-6 w-6"/>}</span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-800">{en?english:ar}</span><span className={`mt-1 block text-xs font-semibold ${enabled?"text-emerald-700":"text-slate-500"}`}>{enabled?t("مفعّل","Enabled"):t("متوقف","Disabled")}</span></span></button>})}</div>
      <div className="flex justify-end"><button disabled={saving} onClick={saveFeatures} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"><Save className="h-4 w-4"/>{saving?t("جارٍ الحفظ...","Saving..."):t("حفظ إعدادات النظام","Save system settings")}</button></div>
    </div>}
  </div>;
}
