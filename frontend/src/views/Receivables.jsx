import { useEffect, useMemo, useState } from "react";
import { api, useStore } from "../store/index.js";
import { HandCoins, CalendarClock, RefreshCw, Plus } from "lucide-react";
import toast from "react-hot-toast";import { useDialog } from "../components/InteractionProvider.jsx";
const fmt=v=>Number(v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
export default function Receivables(){
  const language = useStore((state) => state.language);
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;const { prompt } = useDialog();const activeBranch=useStore(s=>s.activeBranch);const [rows,setRows]=useState([]),[customers,setCustomers]=useState([]),[accounts,setAccounts]=useState([]);const [receipt,setReceipt]=useState(null);const [f,setF]=useState({customerId:'',amount:'',installmentsCount:0,firstDueDate:'',dueDate:''});
const load=async()=>{try{const [r,c,a]=await Promise.all([api.get('/receivables'),api.get('/customers'),api.get('/finance/accounts')]);setRows(r.data);setCustomers(Array.isArray(c.data)?c.data:(c.data.data||[]));setAccounts(a.data)}catch(e){toast.error(e.response?.data?.error||t('تعذر تحميل المديونيات','Could not load receivables'))}};useEffect(()=>{if(activeBranch?.id)load()},[activeBranch?.id]);
const outstanding=useMemo(()=>rows.reduce((s,r)=>s+Number(r.remaining),0),[rows]), overdue=rows.filter(r=>r.status==='OVERDUE'||r.installments?.some(i=>i.status==='OVERDUE')).length;
const create=async()=>{try{await api.post('/receivables',{...f,amount:Number(f.amount),installmentsCount:Number(f.installmentsCount)});toast.success(t('تم إنشاء المديونية','Receivable created'));setF({customerId:'',amount:'',installmentsCount:0,firstDueDate:'',dueDate:''});load()}catch(e){toast.error(e.response?.data?.error||t('تعذر إنشاء المديونية','Could not create receivable'))}};
const pay=async r=>{
  const openInstallments=(r.installments||[]).filter(i=>Number(i.amount)-Number(i.paidAmount)>0.000001);
  let installmentId="";
  let targetBalance=Number(r.remaining);
  const choices=[
    {value:"FULL",label:t("سداد كامل المستحق · "+fmt(r.remaining),"Pay full outstanding · "+fmt(r.remaining))},
    ...(openInstallments.length?[
      {value:"AUTO",label:t("تحصيل جزئي وتوزيعه على أقدم الأقساط","Partial payment · apply to oldest installments")},
      ...openInstallments.map(i => ({
        value: i.id,
        label: t(
          "قسط #" + i.sequence + " · متبقي " + fmt(Number(i.amount) - Number(i.paidAmount)),
          "Installment #" + i.sequence + " · remaining " + fmt(Number(i.amount) - Number(i.paidAmount))
        )
      }))
    ]:[{value:"PARTIAL",label:t("تحصيل مبلغ جزئي","Collect a partial amount")}])
  ];
  const target=await prompt(t("اختر طريقة التحصيل","Choose collection method"),openInstallments.length?"AUTO":"PARTIAL",{title:t("طريقة التحصيل","Collection method"),choices});
  if(target==null)return;
  const payAll=target==="FULL";
  if(target!=="FULL"&&target!=="AUTO"&&target!=="PARTIAL"){
    const selected=openInstallments.find(i=>i.id===target);
    if(!selected)return;
    installmentId=selected.id;
    targetBalance=Number(selected.amount)-Number(selected.paidAmount);
  }
  let amount=targetBalance;
  if(!payAll){
    const amountInput=await prompt(t("المتبقي "+fmt(targetBalance)+". أدخل مبلغ التحصيل.","Remaining amount: "+fmt(targetBalance)+". Enter the collection amount."),"",{title:t("تحصيل دفعة من العميل","Collect customer payment"),placeholder:t("مبلغ التحصيل","Payment amount")});
    if(amountInput==null||String(amountInput).trim()==="")return;
    amount=Number(String(amountInput).trim());
  }
  if(!Number.isFinite(amount)||amount<=0){toast.error(t("أدخل مبلغًا صحيحًا أكبر من صفر","Enter a valid amount greater than zero"));return;}
  if(amount>targetBalance+0.000001){toast.error(t("المبلغ أكبر من المتبقي في القسط أو المديونية","Amount exceeds the remaining installment or receivable balance"));return;}
  const activeAccounts=accounts.filter(a=>a.isActive!==false);
  if(!activeAccounts.length){toast.error(t("لا توجد حسابات تحصيل فعالة لهذا الفرع","No active collection accounts for this branch"));return;}
  const accountId=await prompt(t("اختر حساب استلام مبلغ التحصيل","Select the collection account"),"",{title:t("حساب التحصيل","Collection account"),choices:activeAccounts.map(a=>({value:a.id,label:a.name+" · "+a.type}))});
  if(!accountId)return;
  try{
    const response=await api.post("/receivables/"+r.id+"/pay",{amount,accountId,installmentId:installmentId||undefined});
    const selectedAccount=activeAccounts.find(a=>a.id===accountId);
    const selectedInstallment=(r.installments||[]).find(i=>i.id===installmentId);
    const latestPayment=(response.data?.payments||[]).slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0];
    setReceipt({customerName:r.customer?.name||"",invoiceNumber:r.invoice?.invoiceNumber||"",amount,accountName:selectedAccount?.name||"",paymentId:latestPayment?.id||"",date:new Date().toLocaleString(),installmentLabel:selectedInstallment?t("القسط #"+selectedInstallment.sequence,"Installment #"+selectedInstallment.sequence):payAll?t("سداد كامل المستحق","Full outstanding balance"):openInstallments.length?t("توزيع تلقائي","Auto-applied"):t("تحصيل جزئي","Partial payment")});
    toast.success(t("تم التحصيل","Payment collected"));
    await load();
  }catch(e){
    const message=e.response?.data?.error;
    toast.error(message||t("تعذر التحصيل. حدّث الصفحة وتحقق من سجل التحصيل قبل إعادة المحاولة.","Collection failed. Refresh and verify the payment record before retrying."));
  }
};
{receipt&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" dir={en?"ltr":"rtl"}>
  <style>{"@media print { body * { visibility: hidden !important; } #collection-receipt, #collection-receipt * { visibility: visible !important; } #collection-receipt { position: absolute; inset: 0; width: 100%; margin: 0; box-shadow: none !important; } .receipt-no-print { display: none !important; } }"}</style>
  <section className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
    <div id="collection-receipt" className="rounded-xl border border-slate-200 p-5 text-slate-900">
      <div className="border-b pb-3 text-center"><h2 className="text-xl font-extrabold">{t("إيصال تحصيل","Collection receipt")}</h2><p className="mt-1 text-sm text-slate-500">{activeBranch?.name||""}</p></div>
      <div className="space-y-3 py-4 text-sm">
        <div className="flex justify-between gap-3"><span>{t("العميل","Customer")}</span><b>{receipt.customerName}</b></div>
        {receipt.invoiceNumber&&<div className="flex justify-between gap-3"><span>{t("الفاتورة","Invoice")}</span><b>{receipt.invoiceNumber}</b></div>}
        <div className="flex justify-between gap-3"><span>{t("طريقة التوزيع","Allocation")}</span><b>{receipt.installmentLabel}</b></div>
        <div className="flex justify-between gap-3"><span>{t("حساب التحصيل","Collection account")}</span><b>{receipt.accountName}</b></div>
        <div className="flex justify-between gap-3"><span>{t("التاريخ","Date")}</span><b>{receipt.date}</b></div>
        {receipt.paymentId&&<div className="break-all text-xs text-slate-500">{t("رقم سجل التحصيل","Payment record ID")}: {receipt.paymentId}</div>}
        <div className="mt-3 border-t pt-4 text-center"><p className="text-sm text-slate-500">{t("المبلغ المستلم","Amount received")}</p><p className="text-3xl font-black text-emerald-700">{fmt(receipt.amount)}</p></div>
      </div><p className="border-t pt-3 text-center text-xs text-slate-500">{t("شكرًا لكم","Thank you")}</p>
    </div>
    <div className="receipt-no-print mt-4 flex gap-2"><button onClick={()=>window.print()} className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white">{t("طباعة الإيصال","Print receipt")}</button><button onClick={()=>setReceipt(null)} className="rounded-xl border px-4 py-3 font-semibold">{t("إغلاق","Close")}</button></div>
  </section>
</div>}return <div className="p-6 space-y-5" dir={en ? "ltr" : "rtl"}><div className="flex justify-between items-center"><div><h1 className="text-2xl font-bold">{t("الآجل والأقساط", "Receivables & installments")}</h1><p className="text-sm text-slate-500">{t("مديونيات العملاء، التحصيل، وجدول الأقساط", "Customer balances, collections and installment schedules")}</p></div><button onClick={load} className="p-2 border bg-white rounded-xl"><RefreshCw className="w-4 h-4"/></button></div><div className="grid md:grid-cols-3 gap-3"><div className="p-4 bg-white border rounded-2xl"><p className="text-xs text-slate-500">{t("إجمالي المستحق", "Total outstanding")}</p><p className="text-2xl font-bold text-indigo-600">{fmt(outstanding)}</p></div><div className="p-4 bg-white border rounded-2xl"><p className="text-xs text-slate-500">{t("حسابات مفتوحة", "Open accounts")}</p><p className="text-2xl font-bold">{rows.filter(r=>r.status!=='PAID').length}</p></div><div className="p-4 bg-white border rounded-2xl"><p className="text-xs text-slate-500">{t("متأخر", "Overdue")}</p><p className="text-2xl font-bold text-red-600">{overdue}</p></div></div>
<div className="bg-white border rounded-2xl p-4"><h2 className="font-bold flex items-center gap-2 mb-3"><HandCoins className="w-5 h-5 text-indigo-600"/>{t("إضافة مديونية / خطة أقساط", "Add receivable / installment plan")}</h2><div className="grid md:grid-cols-6 gap-2"><select value={f.customerId} onChange={e=>setF({...f,customerId:e.target.value})} className="border rounded-xl px-3"><option value="">{t("العميل", "Customer")}</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><input type="number" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})} placeholder={t('المبلغ','Amount')} className="border rounded-xl px-3 py-2"/><input type="number" min="0" value={f.installmentsCount} onChange={e=>setF({...f,installmentsCount:e.target.value})} placeholder={t('عدد الأقساط','Number of installments')} className="border rounded-xl px-3 py-2"/><input type="date" value={f.firstDueDate} onChange={e=>setF({...f,firstDueDate:e.target.value})} className="border rounded-xl px-3 py-2"/><input type="date" value={f.dueDate} onChange={e=>setF({...f,dueDate:e.target.value})} className="border rounded-xl px-3 py-2"/><button onClick={create} className="bg-indigo-600 text-white rounded-xl flex items-center justify-center gap-2"><Plus className="w-4 h-4"/>{t("حفظ", "Save")}</button></div></div>
<div className="grid gap-3">{rows.map(r=><div key={r.id} className="bg-white border rounded-2xl p-4"><div className="flex items-center justify-between"><div><p className="font-bold">{r.customer?.name}</p><p className="text-xs text-slate-500">{r.invoice?.invoiceNumber||t('مديونية مستقلة','Standalone receivable')} • {r.status}</p></div><button onClick={()=>pay(r)} disabled={Number(r.remaining)<=0} className="px-3 py-2 bg-green-600 disabled:opacity-40 text-white rounded-xl text-sm">{t("تحصيل دفعة", "Collect payment")}</button></div><div className="grid grid-cols-3 gap-2 mt-3 text-sm"><div className="bg-slate-50 p-2 rounded-lg">الأصل <b>{fmt(r.originalAmount)}</b></div><div className="bg-green-50 p-2 rounded-lg">مدفوع <b>{fmt(r.paidAmount)}</b></div><div className="bg-amber-50 p-2 rounded-lg">متبقي <b>{fmt(r.remaining)}</b></div></div>{r.installments?.length>0&&<div className="mt-3"><p className="mb-2 text-xs font-bold text-slate-500">{t("جدول الأقساط","Installment schedule")}</p><div className="grid gap-2 sm:grid-cols-2">{r.installments.slice().sort((a,b)=>a.sequence-b.sequence).map(i=><div key={i.id} className={`rounded-xl border p-3 text-xs ${i.status==='PAID'?'border-green-200 bg-green-50':i.status==='OVERDUE'?'border-red-200 bg-red-50':'border-slate-200 bg-slate-50'}`}><div className="flex items-center justify-between gap-2"><b>#{i.sequence} · {new Date(i.dueDate).toLocaleDateString()}</b><span>{t(i.status==="PAID"?"مسدد":i.status==="OVERDUE"?"متأخر":"مستحق",i.status==="PAID"?"Paid":i.status==="OVERDUE"?"Overdue":"Due")}</span></div><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1"><span>{t("قيمة القسط","Amount")}: <b>{fmt(i.amount)}</b></span><span>{t("مدفوع","Paid")}: <b>{fmt(i.paidAmount)}</b></span><span>{t("متبقي","Remaining")}: <b>{fmt(Math.max(0,Number(i.amount)-Number(i.paidAmount)))}</b></span></div></div>)}</div></div>}{r.payments?.length>0&&<div className="mt-3 border-t pt-3"><p className="mb-2 text-xs font-bold text-slate-500">{t("آخر التحصيلات","Recent collections")}</p><div className="space-y-1">{r.payments.slice(0,5).map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"><span>{new Date(p.createdAt).toLocaleString()}</span><b className="text-green-700">{fmt(p.amount)}</b>{p.reference&&<span className="text-slate-500">{t("مرجع","Reference")}: {p.reference}</span>}</div>)}</div></div>}</div>)}</div></div>}
