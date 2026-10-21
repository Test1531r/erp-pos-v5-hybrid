import { useEffect, useState } from "react";
import { api, useStore } from "../store/index.js";
import { Gift, Smartphone, Star, Plus, PackageCheck, Pencil, Power, Search } from "lucide-react";
import toast from "react-hot-toast";

const toLocalDateTime = (value) => { const d = new Date(value); const pad = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export default function Growth() {
  const language = useStore((state) => state.language);
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;
  const activeBranch = useStore((s) => s.activeBranch);
  const products = useStore((s) => s.products);
  const [tab, setTab] = useState("promotions");
  const [promos, setPromos] = useState([]);
  const [trades, setTrades] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loyalty, setLoyalty] = useState(null);
  const [loyaltyCustomerId, setLoyaltyCustomerId] = useState("");
  const emptyPromo = () => ({ name: "", code: "", type: "PERCENT", value: "", minTotal: "0", maxTotal: "", maxDiscount: "", minQuantity: "1", usageLimit: "", startsAt: toLocalDateTime(new Date()), endsAt: "", productIds: [] });
  const [p, setP] = useState(emptyPromo);
  const [editingPromo, setEditingPromo] = useState(null);
  const [promoSearch, setPromoSearch] = useState("");
  const [tradeForm, setT] = useState({ customerId: "", deviceBrand: "", deviceModel: "", imei: "", condition: "", quotedValue: "" });

  const load = async () => {
    try {
      const [a, b, c] = await Promise.all([api.get("/growth/promotions"), api.get("/growth/trade-ins"), api.get("/customers")]);
      setPromos(a.data);
      setTrades(b.data);
      setCustomers(Array.isArray(c.data) ? c.data : (c.data.data || []));
    } catch {}
  };
  useEffect(() => { if (activeBranch?.id) load(); }, [activeBranch?.id]);

  const savePromo = async () => {
    if (!p.name.trim() || !p.value || !p.startsAt || !p.endsAt) return toast.error("أكمل اسم العرض والقيمة والتاريخ");
    if (new Date(p.endsAt) <= new Date(p.startsAt)) return toast.error("تاريخ النهاية يجب أن يكون بعد البداية");
    const payload = { ...p, value:Number(p.value), minTotal:Number(p.minTotal||0), maxTotal:p.maxTotal===""?null:Number(p.maxTotal), maxDiscount:p.maxDiscount===""?null:Number(p.maxDiscount), minQuantity:Number(p.minQuantity||1), usageLimit:p.usageLimit===""?null:Number(p.usageLimit) };
    try {
      if (editingPromo) await api.put("/growth/promotions/"+editingPromo,payload);
      else await api.post("/growth/promotions",payload);
      toast.success(editingPromo?"تم تحديث العرض":"تم إنشاء العرض"); setP(emptyPromo()); setEditingPromo(null); load();
    } catch(e) { toast.error(e.response?.data?.error || "تعذر حفظ العرض"); }
  };
  const editPromo = (x) => {
    setEditingPromo(x.id);
    setP({ name:x.name||"", code:x.code||"", type:x.type||"PERCENT", value:String(x.value??""), minTotal:String(x.minTotal??0), maxTotal:x.maxTotal==null?"":String(x.maxTotal), maxDiscount:x.maxDiscount==null?"":String(x.maxDiscount), minQuantity:String(x.minQuantity??1), usageLimit:x.usageLimit==null?"":String(x.usageLimit), startsAt:toLocalDateTime(x.startsAt), endsAt:toLocalDateTime(x.endsAt), productIds:(x.products||[]).map(z=>z.productId) });
  };
  const togglePromo = async (x) => {
    try { await api.patch("/growth/promotions/"+x.id,{isActive:!x.isActive}); toast.success(x.isActive?"تم إيقاف العرض":"تم تفعيل العرض"); load(); }
    catch(e) { toast.error(e.response?.data?.error || "تعذر تغيير حالة العرض"); }
  };
  const createTrade = async () => {
    try {
      await api.post("/growth/trade-ins", { ...tradeForm, quotedValue: Number(tradeForm.quotedValue) });
      toast.success("تم تسجيل Trade-In"); setT({ customerId: "", deviceBrand: "", deviceModel: "", imei: "", condition: "", quotedValue: "" }); load();
    } catch (e) { toast.error(e.response?.data?.error || "تعذر التسجيل"); }
  };
  const loadLoyalty = async (id = loyaltyCustomerId) => {
    if (!id) return setLoyalty(null);
    try { const { data } = await api.get(`/growth/loyalty/${id}`); setLoyalty(data); } catch (e) { toast.error(e.response?.data?.error || "تعذر تحميل النقاط"); }
  };
  const adjustPoints = async () => {
    if (!loyaltyCustomerId) return toast.error("اختر العميل");
    const points = Number(prompt("عدد النقاط (+ إضافة / - خصم)", "0"));
    if (!Number.isInteger(points) || points === 0) return;
    const notes = prompt("سبب التسوية", "تسوية نقاط") || "تسوية نقاط";
    try { await api.post(`/growth/loyalty/${loyaltyCustomerId}/adjust`, { points, notes }); toast.success("تم تحديث النقاط"); loadLoyalty(); }
    catch (e) { toast.error(e.response?.data?.error || "تعذر تحديث النقاط"); }
  };
  const receiveTrade = async (trade) => {
    const productId = prompt(`اكتب Product ID لإدخال ${trade.deviceBrand || "الجهاز"} للمخزون:\n${products.slice(0,30).map(x => `${x.name}: ${x.id}`).join("\n")}`);
    if (!productId) return;
    try { await api.post(`/growth/trade-ins/${trade.id}/receive-stock`, { productId }); toast.success("تم إدخال الجهاز للمخزون"); load(); }
    catch (e) { toast.error(e.response?.data?.error || "تعذر إدخال الجهاز للمخزون"); }
  };

  return <div className="p-6 space-y-5" dir={en ? "ltr" : "rtl"}>
    <div><h1 className="text-2xl font-bold">{t("العروض والولاء و Trade-In", "Promotions, loyalty & trade-in")}</h1><p className="text-sm text-slate-500">{t("مركز نمو المبيعات وخدمة العملاء", "Sales growth and customer engagement center")}</p></div>
    <div className="flex gap-2 flex-wrap">
      <button onClick={() => setTab("promotions")} className={`px-4 py-2 rounded-xl ${tab === "promotions" ? "bg-indigo-600 text-white" : "bg-white border"}`}><Gift className="w-4 h-4 inline ml-1" />{t("العروض", "Promotions")}</button>
      <button onClick={() => setTab("loyalty")} className={`px-4 py-2 rounded-xl ${tab === "loyalty" ? "bg-indigo-600 text-white" : "bg-white border"}`}><Star className="w-4 h-4 inline ml-1" />{t("الولاء", "Loyalty")}</button>
      <button onClick={() => setTab("trade")} className={`px-4 py-2 rounded-xl ${tab === "trade" ? "bg-indigo-600 text-white" : "bg-white border"}`}><Smartphone className="w-4 h-4 inline ml-1" />Trade-In</button>
    </div>

    {tab === "promotions" && <>
      <section className="rounded-3xl border bg-white p-5 shadow-sm space-y-4">
        <div><h2 className="text-lg font-extrabold">{editingPromo ? "تعديل العرض" : "إنشاء عرض احترافي"}</h2><p className="text-sm text-slate-500 mt-1">تحكم في كود الخصم والحدود وفترة الصلاحية والاستخدام.</p></div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm font-semibold">اسم العرض *<input value={p.name} onChange={e=>setP({...p,name:e.target.value})} className="mt-1 w-full rounded-xl border p-3 font-normal" placeholder="خصم نهاية الأسبوع"/></label>
          <label className="text-sm font-semibold">كود الخصم<input value={p.code} onChange={e=>setP({...p,code:e.target.value.toUpperCase().replace(/\s/g,"")})} className="mt-1 w-full rounded-xl border p-3 font-mono font-normal" placeholder="WEEKEND15"/></label>
          <label className="text-sm font-semibold">نوع الخصم<select value={p.type} onChange={e=>setP({...p,type:e.target.value})} className="mt-1 w-full rounded-xl border bg-white p-3 font-normal"><option value="PERCENT">نسبة مئوية %</option><option value="FIXED">مبلغ ثابت</option></select></label>
          <label className="text-sm font-semibold">قيمة الخصم *<input type="number" min="0.01" max={p.type==="PERCENT"?100:undefined} step="0.01" value={p.value} onChange={e=>setP({...p,value:e.target.value})} className="mt-1 w-full rounded-xl border p-3 font-normal"/></label>
          <label className="text-sm font-semibold">الحد الأدنى للفاتورة<input type="number" min="0" step="0.01" value={p.minTotal} onChange={e=>setP({...p,minTotal:e.target.value})} className="mt-1 w-full rounded-xl border p-3 font-normal" placeholder="0 = بدون حد"/></label>
          <label className="text-sm font-semibold">الحد الأقصى للفاتورة<input type="number" min="0" step="0.01" value={p.maxTotal} onChange={e=>setP({...p,maxTotal:e.target.value})} className="mt-1 w-full rounded-xl border p-3 font-normal" placeholder="اختياري"/></label>
          <label className="text-sm font-semibold">أقصى مبلغ للخصم<input type="number" min="0.01" step="0.01" value={p.maxDiscount} onChange={e=>setP({...p,maxDiscount:e.target.value})} className="mt-1 w-full rounded-xl border p-3 font-normal" placeholder="اختياري"/></label>
          <label className="text-sm font-semibold">أقل عدد قطع<input type="number" min="1" step="1" value={p.minQuantity} onChange={e=>setP({...p,minQuantity:e.target.value})} className="mt-1 w-full rounded-xl border p-3 font-normal"/></label>
          <label className="text-sm font-semibold">حد مرات الاستخدام<input type="number" min="1" step="1" value={p.usageLimit} onChange={e=>setP({...p,usageLimit:e.target.value})} className="mt-1 w-full rounded-xl border p-3 font-normal" placeholder="غير محدود"/></label>
          <label className="text-sm font-semibold">بداية العرض *<input type="datetime-local" value={p.startsAt} onChange={e=>setP({...p,startsAt:e.target.value})} className="mt-1 w-full rounded-xl border p-3 font-normal"/></label>
          <label className="text-sm font-semibold">نهاية العرض *<input type="datetime-local" value={p.endsAt} onChange={e=>setP({...p,endsAt:e.target.value})} className="mt-1 w-full rounded-xl border p-3 font-normal"/></label>
        </div>
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold">المنتجات المشمولة بالعرض</h3><p className="text-xs text-slate-500">اترك الاختيار فارغًا لتطبيق العرض على كل منتجات الفاتورة المؤهلة.</p></div><span className="text-xs font-semibold text-indigo-700">{p.productIds.length ? "تم اختيار " + p.productIds.length + " منتج" : "كل المنتجات"}</span></div>
          <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {products.filter(x=>x.isActive!==false).map(product=><label key={product.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-100 p-2 text-sm hover:bg-slate-50"><input type="checkbox" checked={p.productIds.includes(product.id)} onChange={e=>setP(old=>({...old,productIds:e.target.checked?[...old.productIds,product.id]:old.productIds.filter(id=>id!==product.id)}))}/><span className="min-w-0"><span className="block truncate font-semibold">{product.name}</span><span className="block truncate text-xs text-slate-500">{product.sku||product.id}</span></span></label>)}
          </div>
          {!products.length && <p className="mt-2 text-xs text-amber-700">قائمة المنتجات غير متاحة حاليًا؛ يمكنك إنشاء العرض دون تخصيص منتجات.</p>}
        </div>
        <div className="flex gap-2"><button onClick={savePromo} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white"><Plus className="h-4 w-4"/>{editingPromo?"حفظ التعديلات":"إنشاء العرض"}</button>{editingPromo&&<button onClick={()=>{setP(emptyPromo());setEditingPromo(null);}} className="rounded-xl border px-4 py-3">إلغاء</button>}</div>
      </section>
      <section className="space-y-3"><div className="flex items-center justify-between gap-3 flex-wrap"><div><h2 className="text-lg font-extrabold">إدارة العروض</h2><p className="text-sm text-slate-500">{promos.length} عرض مسجل</p></div><div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"/><input value={promoSearch} onChange={e=>setPromoSearch(e.target.value)} placeholder="ابحث بالاسم أو الكود" className="rounded-xl border bg-white py-2.5 pr-9 pl-3 text-sm"/></div></div>
      <div className="grid gap-3 xl:grid-cols-2">{promos.filter(x=>(x.name+" "+(x.code||"")).toLowerCase().includes(promoSearch.toLowerCase())).map(x=><article key={x.id} className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 flex-wrap"><h3 className="font-extrabold">{x.name}</h3><span className={"rounded-full px-2 py-1 text-xs font-bold "+(x.isActive?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-600")}>{x.isActive?"فعّال":"موقوف"}</span></div><p className="mt-1 font-mono text-sm text-indigo-700">{x.code||"بدون كود"}</p></div><strong className="text-2xl text-indigo-700">{Number(x.value)}{x.type==="PERCENT"?"%":" ج"}</strong></div><div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">الحد الأدنى</p><b>{Number(x.minTotal||0).toLocaleString()} ج</b></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">الحد الأقصى</p><b>{x.maxTotal==null?"بدون حد":Number(x.maxTotal).toLocaleString()+" ج"}</b></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">الاستخدام</p><b>{x.usedCount||0} / {x.usageLimit??"∞"}</b></div></div><p className="mt-3 text-xs text-slate-500">{new Date(x.startsAt).toLocaleString()} → {new Date(x.endsAt).toLocaleString()} · أقل قطع {x.minQuantity||1}{x.maxDiscount!=null?" · أقصى خصم "+Number(x.maxDiscount).toLocaleString()+" ج":""}</p><div className="mt-4 flex gap-2"><button onClick={()=>editPromo(x)} className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-sm"><Pencil className="h-4 w-4"/>تعديل</button><button onClick={()=>togglePromo(x)} className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-sm"><Power className="h-4 w-4"/>{x.isActive?"إيقاف":"تفعيل"}</button></div></article>)}</div>
      {!promos.length&&<div className="rounded-2xl border border-dashed bg-white p-10 text-center text-slate-500">لا توجد عروض حتى الآن.</div>}</section>
    </>}
    {tab === "loyalty" && <>
      <div className="bg-white border rounded-2xl p-4 flex gap-2 flex-wrap items-center">
        <select className="border rounded-xl px-3 py-2 min-w-64" value={loyaltyCustomerId} onChange={e => { setLoyaltyCustomerId(e.target.value); loadLoyalty(e.target.value); }}><option value="">{t("اختر العميل", "Select customer")}</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name} {c.phone ? `- ${c.phone}` : ""}</option>)}</select>
        <button onClick={() => loadLoyalty()} className="border px-4 py-2 rounded-xl">{t("تحديث", "Refresh")}</button>
        <button onClick={adjustPoints} className="bg-indigo-600 text-white px-4 py-2 rounded-xl">{t("تسوية نقاط", "Adjust points")}</button>
      </div>
      {loyalty && <div className="grid md:grid-cols-3 gap-3"><div className="bg-white border rounded-2xl p-5"><p className="text-sm text-slate-500">رصيد {loyalty.customer.name}</p><p className="text-3xl font-bold text-amber-600 mt-2">{loyalty.customer.loyaltyPoints} نقطة</p></div><div className="md:col-span-2 bg-white border rounded-2xl overflow-hidden"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-3 text-right">{t("التاريخ", "Date")}</th><th>{t("النوع", "Type")}</th><th>{t("النقاط", "Points")}</th><th>{t("ملاحظات", "Notes")}</th></tr></thead><tbody>{loyalty.transactions.map(x => <tr className="border-t" key={x.id}><td className="p-3">{new Date(x.createdAt).toLocaleString()}</td><td className="text-center">{x.type}</td><td className={`text-center font-bold ${x.points >= 0 ? "text-green-600" : "text-red-600"}`}>{x.points}</td><td>{x.notes || "—"}</td></tr>)}</tbody></table></div></div>}
    </>}

    {tab === "trade" && <>
      <div className="bg-white border rounded-2xl p-4 grid md:grid-cols-7 gap-2">
        <select className="border rounded-xl px-3" value={tradeForm.customerId} onChange={e => setT({ ...tradeForm, customerId: e.target.value })}><option value="">{t("العميل (اختياري)", "Customer (optional)")}</option>{customers.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select>
        <input className="border rounded-xl px-3" placeholder="الماركة" value={tradeForm.deviceBrand} onChange={e => setT({ ...tradeForm, deviceBrand: e.target.value })} />
        <input className="border rounded-xl px-3" placeholder="الموديل" value={tradeForm.deviceModel} onChange={e => setT({ ...tradeForm, deviceModel: e.target.value })} />
        <input className="border rounded-xl px-3" placeholder="IMEI" value={tradeForm.imei} onChange={e => setT({ ...tradeForm, imei: e.target.value })} />
        <input className="border rounded-xl px-3" placeholder={t("الحالة", "Status")} value={tradeForm.condition} onChange={e => setT({ ...tradeForm, condition: e.target.value })} />
        <input type="number" className="border rounded-xl px-3" placeholder={t("التقييم", "Valuation")} value={tradeForm.quotedValue} onChange={e => setT({ ...tradeForm, quotedValue: e.target.value })} />
        <button onClick={createTrade} className="bg-indigo-600 text-white rounded-xl"><Plus className="w-4 h-4 inline" /> تسجيل</button>
      </div>
      <div className="grid md:grid-cols-3 gap-3">{trades.map(x => <div key={x.id} className="bg-white border rounded-2xl p-4"><p className="font-bold">{x.deviceBrand} {x.deviceModel}</p><p className="text-xs font-mono text-slate-500">{x.imei || "بدون IMEI"}</p><p className="mt-2">الحالة: {x.status}</p><p className="font-bold text-indigo-600">تقييم: {Number(x.quotedValue).toLocaleString()}</p>{x.product && <p className="text-xs text-green-700 mt-2">مخزون: {x.product.name}</p>}{x.status !== "APPROVED" && <button onClick={() => receiveTrade(x)} className="mt-3 px-3 py-2 rounded-xl bg-green-50 text-green-700 text-xs flex items-center gap-1"><PackageCheck className="w-4 h-4" />{t("اعتماد وإدخال للمخزون", "Approve and add to inventory")}</button>}</div>)}</div>
    </>}
  </div>;
}
