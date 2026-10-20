import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useStore, api } from "../store/index.js";
import { Globe } from "lucide-react";
import {
  LayoutDashboard, ShoppingCart, Package, Receipt, Users, Wrench,
  ArrowLeftRight, Wallet, UserCog, LogOut, Menu, X, ChevronRight,
  Bell, Store, Wifi, Building2, Landmark, RotateCcw, History, PackagePlus, HandCoins, ShieldCheck, Gift, CalendarCheck, Barcode, ClipboardCheck, BarChart3, Settings2, RefreshCw, WifiOff
} from "lucide-react";

const NAV = [
  { path: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { path: "/sync", label: "مركز المزامنة", icon: RefreshCw },
  { path: "/pos", label: "نقطة البيع", icon: ShoppingCart },
  { path: "/inventory", label: "المخزون", icon: Package },
  { path: "/stock-ledger", label: "حركة المخزون", icon: History },
  { path: "/purchases", label: "المشتريات والموردين", icon: PackagePlus, roles: ["SUPER_ADMIN", "BRANCH_MANAGER", "INVENTORY_MANAGER", "ACCOUNTANT"] },
  { path: "/receivables", label: "الآجل والأقساط", icon: HandCoins, roles: ["SUPER_ADMIN", "BRANCH_MANAGER", "CASHIER", "ACCOUNTANT"] },
  { path: "/approvals", label: "الموافقات", icon: ShieldCheck },
  { path: "/growth", label: "العروض و Trade-In", icon: Gift },
  { path: "/closing", label: "الإقفال اليومي", icon: CalendarCheck, roles: ["SUPER_ADMIN", "BRANCH_MANAGER", "ACCOUNTANT"] },
  { path: "/tools", label: "الباركود والاستيراد", icon: Barcode, roles: ["SUPER_ADMIN", "BRANCH_MANAGER", "INVENTORY_MANAGER"] },
  { path: "/stocktake", label: "الجرد الدوري", icon: ClipboardCheck, roles: ["SUPER_ADMIN", "BRANCH_MANAGER", "INVENTORY_MANAGER"] },
  { path: "/reports", label: "تقارير الإدارة", icon: BarChart3, roles: ["SUPER_ADMIN", "BRANCH_MANAGER", "ACCOUNTANT"] },
  { path: "/settings", label: "الإعدادات", icon: Settings2, roles: ["SUPER_ADMIN", "BRANCH_MANAGER"] },
  { path: "/sales", label: "المبيعات", icon: Receipt },
  { path: "/customers", label: "العملاء", icon: Users },
  { path: "/repairs", label: "الصيانة", icon: Wrench },
  { path: "/transfers", label: "نقل المخزون", icon: ArrowLeftRight },
  { path: "/expenses", label: "المصروفات", icon: Wallet },
  { path: "/finance", label: "المالية والمحافظ", icon: Landmark, roles: ["SUPER_ADMIN", "BRANCH_MANAGER", "CASHIER", "ACCOUNTANT"] },
  { path: "/returns", label: "المرتجعات", icon: RotateCcw, roles: ["SUPER_ADMIN", "BRANCH_MANAGER", "CASHIER", "ACCOUNTANT"] },
  { path: "/users", label: "المستخدمين", icon: UserCog, roles: ["SUPER_ADMIN", "BRANCH_MANAGER"] },
  {
  path: "/branches",
  label: "الفروع",
  icon: Building2,
  roles: ["SUPER_ADMIN"]
},
];

export default function Layout() {
  const { user, activeBranch, branches, setActiveBranch, sidebarOpen, toggleSidebar, logout, fetchDashboard, fetchCategories, fetchProducts, fetchBranches, isOnline, offlineQueue, setOnlineStatus, syncOfflineQueue, language, setLanguage, systemFeatures, setSystemFeatures } = useStore();
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;
  const navigate = useNavigate();
  const location = useLocation();
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const loadNotifications = async () => {
    try { const { data } = await api.get("/growth/notifications"); setNotifications(data || []); } catch {}
  };

  useEffect(() => {
    fetchBranches();
    api.get("/settings/features").then(r => setSystemFeatures(r.data.features || {})).catch(() => {});
    fetchCategories();
    fetchProducts();
    fetchDashboard();
    loadNotifications();
  }, [activeBranch?.id, user?.id]);

  useEffect(() => {
    const timer = setInterval(loadNotifications, 60000);
    return () => clearInterval(timer);
  }, [activeBranch?.id]);

  useEffect(() => {
    const online = () => { setOnlineStatus(true); syncOfflineQueue(); };
    const offline = () => setOnlineStatus(false);
    window.addEventListener("online", online); window.addEventListener("offline", offline);
    setOnlineStatus(navigator.onLine);
    if (navigator.onLine) syncOfflineQueue();
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);

  const handleLogout = () => { logout(); navigate("/login"); };

  useEffect(() => {
    document.documentElement.lang = en ? "en" : "ar";
    document.documentElement.dir = en ? "ltr" : "rtl";
  }, [en]);

  const FEATURE_BY_PATH = { "/dashboard":"dashboard", "/sync":"sync", "/pos":"pos", "/inventory":"inventory", "/stock-ledger":"stockLedger", "/purchases":"purchases", "/receivables":"receivables", "/approvals":"approvals", "/growth":"growth", "/closing":"closing", "/tools":"tools", "/stocktake":"stocktake", "/reports":"reports", "/settings":null, "/sales":"sales", "/customers":"customers", "/repairs":"repairs", "/transfers":"transfers", "/expenses":"expenses", "/finance":"finance", "/returns":"returns", "/users":"users", "/branches":"branches" };
  const navItems = NAV.filter((item) => (!item.roles || item.roles.includes(user?.role)) && (FEATURE_BY_PATH[item.path] == null || systemFeatures[FEATURE_BY_PATH[item.path]] !== false));

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100" dir={en ? "ltr" : "rtl"}>
      <button onClick={() => navigate("/sync")} className={`fixed bottom-4 left-4 z-50 px-3 py-2 rounded-full shadow-lg text-xs font-bold flex items-center gap-2 ${isOnline ? "bg-green-600 text-white" : "bg-amber-500 text-white"}`}>{isOnline ? <Wifi className="w-4 h-4"/> : <WifiOff className="w-4 h-4"/>}{isOnline ? "Online" : "Offline"}{offlineQueue.filter(x=>x.status==="PENDING").length>0 && ` • ${offlineQueue.filter(x=>x.status==="PENDING").length}`}</button>
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-64" : "w-16"} transition-all duration-300 bg-slate-900 flex flex-col shrink-0 shadow-2xl`}>
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-700">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Store className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-tight">{document.documentElement.lang === "en" ? "Alashry" : "العشري"}</p>
                <p className="text-indigo-400 text-[10px]">{activeBranch?.name || "اختر فرع"}</p>
              </div>
            </div>
          )}
          <button onClick={toggleSidebar} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors">
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-all duration-150 relative
                  ${active ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
              >
                {active && <div className={`absolute ${en ? "left-0 rounded-r-full" : "right-0 rounded-l-full"} top-0 bottom-0 w-1 bg-indigo-400`} />}
                <Icon className={`w-5 h-5 shrink-0 ${active ? "text-white" : ""}`} />
                {sidebarOpen && <span className="font-medium">{t(item.label, ({ "لوحة التحكم":"Dashboard", "مركز المزامنة":"Sync Center", "نقطة البيع":"Point of Sale", "المخزون":"Inventory", "حركة المخزون":"Stock Ledger", "المشتريات والموردين":"Purchases & Suppliers", "الآجل والأقساط":"Receivables & Installments", "الموافقات":"Approvals", "العروض و Trade-In":"Promotions & Trade-In", "الإقفال اليومي":"Daily Closing", "الباركود والاستيراد":"Barcode & Import", "الجرد الدوري":"Stocktake", "تقارير الإدارة":"Management Reports", "الإعدادات":"Settings", "المبيعات":"Sales", "العملاء":"Customers", "الصيانة":"Repairs", "نقل المخزون":"Stock Transfers", "المصروفات":"Expenses", "المالية والمحافظ":"Finance & Wallets", "المرتجعات":"Returns", "المستخدمين":"Users", "الفروع":"Branches" })[item.label] || item.label)}</span>}
              </button>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-slate-700">
          {sidebarOpen ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {user?.name?.slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate">{user?.name}</p>
                <p className="text-slate-400 text-[10px]">{user?.role}</p>
              </div>
              <button onClick={handleLogout} className="text-slate-400 hover:text-red-400 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button onClick={handleLogout} className="w-full flex justify-center text-slate-400 hover:text-red-400">
              <LogOut className="w-5 h-5" />
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 shadow-sm">
          <div>
            <h1 className="font-bold text-slate-800">{t(NAV.find((n) => n.path === location.pathname)?.label || "النظام", ({ "لوحة التحكم":"Dashboard", "مركز المزامنة":"Sync Center", "نقطة البيع":"Point of Sale", "المخزون":"Inventory", "حركة المخزون":"Stock Ledger", "المشتريات والموردين":"Purchases & Suppliers", "الآجل والأقساط":"Receivables & Installments", "الموافقات":"Approvals", "العروض و Trade-In":"Promotions & Trade-In", "الإقفال اليومي":"Daily Closing", "الباركود والاستيراد":"Barcode & Import", "الجرد الدوري":"Stocktake", "تقارير الإدارة":"Management Reports", "الإعدادات":"Settings", "المبيعات":"Sales", "العملاء":"Customers", "الصيانة":"Repairs", "نقل المخزون":"Stock Transfers", "المصروفات":"Expenses", "المالية والمحافظ":"Finance & Wallets", "المرتجعات":"Returns", "المستخدمين":"Users", "الفروع":"Branches" })[NAV.find((n) => n.path === location.pathname)?.label] || "System")}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setLanguage(en ? "ar" : "en")} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" aria-label={t("تغيير اللغة", "Change language")}><Globe className="h-4 w-4"/>{en ? "العربية" : "English"}</button>
            <div className="relative">
              <button onClick={() => setShowNotifications(!showNotifications)} className="relative p-2 rounded-xl hover:bg-slate-100 text-slate-600">
                <Bell className="w-5 h-5" />
                {notifications.filter(n => !n.isRead).length > 0 && <span className="absolute -top-0.5 -left-0.5 min-w-4 h-4 px-1 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center">{notifications.filter(n => !n.isRead).length}</span>}
              </button>
              {showNotifications && <div className={`absolute ${en ? "left-0" : "right-0"} top-11 w-80 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden`}>
                <div className="px-4 py-3 border-b font-bold text-sm">{t("الإشعارات","Notifications")}</div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.slice(0,20).map(n => <button key={n.id} onClick={async()=>{ if(!n.isRead){await api.post(`/growth/notifications/${n.id}/read`).catch(()=>{}); setNotifications(x=>x.map(v=>v.id===n.id?{...v,isRead:true}:v));} if(n.link){navigate(n.link);setShowNotifications(false);} }} className={`w-full ${en ? "text-left" : "text-right"} px-4 py-3 border-b hover:bg-slate-50 ${n.isRead ? "bg-white" : "bg-indigo-50/60"}`}>
                    <p className="text-sm font-semibold text-slate-800">{n.title}</p><p className="text-xs text-slate-500 mt-0.5">{n.message}</p><p className="text-[10px] text-slate-400 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                  </button>)}
                  {!notifications.length && <div className="p-6 text-center text-sm text-slate-400">{t("لا توجد إشعارات","No notifications")}</div>}
                </div>
              </div>}
            </div>
            <div className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full font-medium">
              <Wifi className="w-3 h-3" /> {t("متصل","Online")}
            </div>
            {user?.role === "SUPER_ADMIN" && branches.length > 0 ? (
              <select value={activeBranch?.id || ""} onChange={(e) => setActiveBranch(branches.find((b) => b.id === e.target.value) || null)} className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-full font-medium border-0 outline-none">
                <option value="">{t("كل الفروع / اختر فرعاً","All branches / Select a branch")}</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            ) : activeBranch && (
              <div className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-medium">📍 {activeBranch.name}</div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
