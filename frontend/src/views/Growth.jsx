import { useEffect, useState } from "react";
import { api, useStore } from "../store/index.js";
import { Gift, Smartphone, Star, Plus, PackageCheck } from "lucide-react";
import toast from "react-hot-toast";

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
  const [p, setP] = useState({ name: "", code: "", type: "PERCENT", value: "", startsAt: "", endsAt: "" });
  const [t, setT] = useState({ customerId: "", deviceBrand: "", deviceModel: "", imei: "", condition: "", quotedValue: "" });

  const load = async () => {
    try {
      const [a, b, c] = await Promise.all([api.get("/growth/promotions"), api.get("/growth/trade-ins"), api.get("/customers")]);
      setPromos(a.data);
      setTrades(b.data);
      setCustomers(Array.isArray(c.data) ? c.data : (c.data.data || []));
    } catch {}
  };
  useEffect(() => { if (activeBranch?.id) load(); }, [activeBranch?.id]);

  const createPromo = async () => {
    try {
      await api.post("/growth/promotions", { ...p, value: Number(p.value), startsAt: p.startsAt, endsAt: p.endsAt });
      toast.success("تم إنشاء العرض"); setP({ name: "", code: "", type: "PERCENT", value: "", startsAt: "", endsAt: "" }); load();
    } catch (e) { toast.error(e.response?.data?.error || "تعذر إنشاء العرض"); }
  };
  const createTrade = async () => {
    try {
      await api.post("/growth/trade-ins", { ...t, quotedValue: Number(t.quotedValue) });
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
      <div className="bg-white border rounded-2xl p-4 grid md:grid-cols-7 gap-2">
        <input className="border rounded-xl px-3" placeholder="اسم العرض" value={p.name} onChange={e => setP({ ...p, name: e.target.value })} />
        <input className="border rounded-xl px-3" placeholder="كود" value={p.code} onChange={e => setP({ ...p, code: e.target.value })} />
        <select className="border rounded-xl px-3" value={p.type} onChange={e => setP({ ...p, type: e.target.value })}><option value="PERCENT">{t("نسبة %", "Percentage %")}</option><option value="FIXED">{t("مبلغ ثابت", "Fixed amount")}</option></select>
        <input type="number" className="border rounded-xl px-3" placeholder="القيمة" value={p.value} onChange={e => setP({ ...p, value: e.target.value })} />
        <input type="datetime-local" className="border rounded-xl px-2" value={p.startsAt} onChange={e => setP({ ...p, startsAt: e.target.value })} />
        <input type="datetime-local" className="border rounded-xl px-2" value={p.endsAt} onChange={e => setP({ ...p, endsAt: e.target.value })} />
        <button onClick={createPromo} className="bg-indigo-600 text-white rounded-xl"><Plus className="w-4 h-4 inline" /> إضافة</button>
      </div>
      <div className="grid md:grid-cols-3 gap-3">{promos.map(x => <div key={x.id} className="bg-white border rounded-2xl p-4"><p className="font-bold">{x.name}</p><p className="text-xs text-slate-500">{x.code || "بدون كود"} • {x.type}</p><p className="text-2xl font-bold text-indigo-600 mt-3">{Number(x.value)}{x.type === "PERCENT" ? "%" : ""}</p><p className="text-xs mt-2">{new Date(x.startsAt).toLocaleDateString()} → {new Date(x.endsAt).toLocaleDateString()}</p></div>)}</div>
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
        <select className="border rounded-xl px-3" value={t.customerId} onChange={e => setT({ ...t, customerId: e.target.value })}><option value="">{t("العميل (اختياري)", "Customer (optional)")}</option>{customers.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select>
        <input className="border rounded-xl px-3" placeholder="الماركة" value={t.deviceBrand} onChange={e => setT({ ...t, deviceBrand: e.target.value })} />
        <input className="border rounded-xl px-3" placeholder="الموديل" value={t.deviceModel} onChange={e => setT({ ...t, deviceModel: e.target.value })} />
        <input className="border rounded-xl px-3" placeholder="IMEI" value={t.imei} onChange={e => setT({ ...t, imei: e.target.value })} />
        <input className="border rounded-xl px-3" placeholder={t("الحالة", "Status")} value={t.condition} onChange={e => setT({ ...t, condition: e.target.value })} />
        <input type="number" className="border rounded-xl px-3" placeholder={t("التقييم", "Valuation")} value={t.quotedValue} onChange={e => setT({ ...t, quotedValue: e.target.value })} />
        <button onClick={createTrade} className="bg-indigo-600 text-white rounded-xl"><Plus className="w-4 h-4 inline" /> تسجيل</button>
      </div>
      <div className="grid md:grid-cols-3 gap-3">{trades.map(x => <div key={x.id} className="bg-white border rounded-2xl p-4"><p className="font-bold">{x.deviceBrand} {x.deviceModel}</p><p className="text-xs font-mono text-slate-500">{x.imei || "بدون IMEI"}</p><p className="mt-2">الحالة: {x.status}</p><p className="font-bold text-indigo-600">تقييم: {Number(x.quotedValue).toLocaleString()}</p>{x.product && <p className="text-xs text-green-700 mt-2">مخزون: {x.product.name}</p>}{x.status !== "APPROVED" && <button onClick={() => receiveTrade(x)} className="mt-3 px-3 py-2 rounded-xl bg-green-50 text-green-700 text-xs flex items-center gap-1"><PackageCheck className="w-4 h-4" />{t("اعتماد وإدخال للمخزون", "Approve and add to inventory")}</button>}</div>)}</div>
    </>}
  </div>;
}
