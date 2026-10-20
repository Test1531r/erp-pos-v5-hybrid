import { useEffect } from "react";
import { RefreshCw, Wifi, WifiOff, CheckCircle2, AlertTriangle, Clock3 } from "lucide-react";
import { useStore } from "../store/index.js";

export default function SyncCenter() {
  const language = useStore((state) => state.language);
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;
  const { isOnline, offlineQueue, syncOfflineQueue, setOnlineStatus } = useStore();
  useEffect(() => {
    const online = () => { setOnlineStatus(true); syncOfflineQueue(); };
    const offline = () => setOnlineStatus(false);
    window.addEventListener("online", online); window.addEventListener("offline", offline);
    setOnlineStatus(navigator.onLine);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);
  const pending = offlineQueue.filter(x => x.status === "PENDING").length;
  const failed = offlineQueue.filter(x => x.status === "FAILED").length;
  return <div className="p-6 space-y-5" dir={en ? "ltr" : "rtl"}>
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold text-slate-800">{t("مركز المزامنة", "Sync center")}</h1><p className="text-sm text-slate-500">{t("متابعة عمليات وضع عدم الاتصال ومزامنتها مع السيرفر", "Track offline operations and synchronize them with the server")}</p></div>
      <button disabled={!isOnline || pending===0} onClick={syncOfflineQueue} className="bg-indigo-600 disabled:opacity-50 text-white px-4 py-2 rounded-xl flex items-center gap-2"><RefreshCw className="w-4 h-4"/>{t("مزامنة الآن", "Sync now")}</button></div>
    <div className={`rounded-2xl p-4 border flex items-center gap-3 ${isOnline?'bg-green-50 border-green-200':'bg-amber-50 border-amber-200'}`}>{isOnline?<Wifi className="text-green-600"/>:<WifiOff className="text-amber-600"/>}<div><b>{isOnline?'متصل بالإنترنت':'وضع عدم الاتصال'}</b><p className="text-xs text-slate-500">{isOnline?'سيتم رفع العمليات المعلقة تلقائياً':'المبيعات النقدية العادية فقط يمكن حفظها مؤقتاً'}</p></div></div>
    <div className="grid grid-cols-3 gap-3"><Card icon={Clock3} label={t("معلقة", "Pending")} value={pending}/><Card icon={AlertTriangle} label={t("تحتاج مراجعة", "Needs review")} value={failed}/><Card icon={CheckCircle2} label={t("تمت المزامنة", "Synced")} value={offlineQueue.filter(x=>x.status==='SYNCED').length}/></div>
    <div className="bg-white rounded-2xl border overflow-hidden"><div className="p-4 border-b font-bold">{t("سجل العمليات", "Operation log")}</div>{offlineQueue.length===0?<div className="p-10 text-center text-slate-400">{t("لا توجد عمليات Offline", "No offline operations")}</div>:<div className="divide-y">{[...offlineQueue].reverse().map(x=><div key={x.id} className="p-4 flex justify-between gap-4"><div><p className="font-semibold">فاتورة Offline — {Number(x.payload.amountPaid||0).toFixed(2)}</p><p className="text-xs text-slate-400 font-mono">{x.id}</p>{x.error&&<p className="text-xs text-red-600 mt-1">{x.error}</p>}</div><span className={`text-xs h-fit px-2 py-1 rounded-full ${x.status==='SYNCED'?'bg-green-100 text-green-700':x.status==='FAILED'?'bg-red-100 text-red-700':'bg-amber-100 text-amber-700'}`}>{x.status==='SYNCED'?'تمت':x.status==='FAILED'?'فشلت':'معلقة'}</span></div>)}</div>}</div>
  </div>;
}
function Card({icon:Icon,label,value}){return <div className="bg-white border rounded-2xl p-4 flex items-center gap-3"><Icon className="w-5 h-5 text-indigo-600"/><div><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-bold">{value}</p></div></div>}
