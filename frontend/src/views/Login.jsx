import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store/index.js";
import { Smartphone, Lock, User, Eye, EyeOff, Loader2, Globe } from "lucide-react";

export default function Login() {
  const login = useStore((s) => s.login);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard");

  }, [isAuthenticated, en]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await login(form.username, form.password);
    if (result.success) navigate("/dashboard");
    else setError(result.error);
    setLoading(false);
  };

  return (
    <div dir={en ? "ltr" : "rtl"} className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 flex items-center justify-center p-4 relative">
      <button type="button" onClick={() => setLanguage(en ? "ar" : "en")} className="absolute top-5 right-5 inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"><Globe className="h-4 w-4"/>{en ? "العربية" : "English"}</button>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/10 backdrop-blur rounded-2xl mb-4 border border-white/20">
            <Smartphone className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">العشري <span className="text-indigo-300">| Alashry</span></h1>
          <p className="text-indigo-300 mt-1">{t("نظام إدارة الفروع والمبيعات والمخزون", "Branch, sales and inventory management")}</p>
        </div>

        {/* Form */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-6 text-center">{t("تسجيل الدخول", "Sign in")}</h2>

          {error && (
            <div className="bg-red-500/20 border border-red-500/30 text-red-200 rounded-lg px-4 py-3 mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-300" />
              <input
                type="text" value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder={t("اسم المستخدم", "Username")}
                className="w-full bg-white/10 border border-white/20 text-white placeholder-indigo-300 rounded-xl py-3 pr-10 pl-4 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                required
              />
            </div>

            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-300" />
              <input
                type={showPw ? "text" : "password"} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={t("كلمة المرور", "Password")}
                className="w-full bg-white/10 border border-white/20 text-white placeholder-indigo-300 rounded-xl py-3 pr-10 pl-10 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                required
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-300 hover:text-white">
                {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>



            <button
              type="submit" disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/50"
            >
              {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> {t("جاري الدخول...", "Signing in...")}</> : t("دخول", "Sign in")}
            </button>
          </form>


        </div>
      </div>
    </div>
  );
}
