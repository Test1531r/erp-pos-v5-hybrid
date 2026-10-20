import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, MessageSquareText, X } from "lucide-react";
import { useStore } from "../store/index.js";

const InteractionContext = createContext(null);

export function InteractionProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolver = useRef(null);
  const close = useCallback((value) => {
    resolver.current?.(value);
    resolver.current = null;
    setDialog(null);
  }, []);
  const confirm = useCallback((message, options = {}) => new Promise(resolve => {
    resolver.current = resolve;
    setDialog({ kind: "confirm", message, title: options.title || "تأكيد العملية", confirmLabel: options.confirmLabel || "تأكيد", danger: Boolean(options.danger) });
  }), []);
  const prompt = useCallback((message, defaultValue = "", options = {}) => new Promise(resolve => {
    resolver.current = resolve;
    setDialog({ kind: Array.isArray(options.choices) ? "select" : "prompt", message, title: options.title || "إدخال البيانات", defaultValue: String(defaultValue ?? ""), placeholder: options.placeholder || "", choices: Array.isArray(options.choices) ? options.choices : [], confirmLabel: options.confirmLabel || "حفظ" });
  }), []);
  return <InteractionContext.Provider value={{ confirm, prompt }}>
    {children}
    {dialog && <Dialog key={dialog.title + dialog.message} dialog={dialog} onClose={close} />}
  </InteractionContext.Provider>;
}
export function useDialog() {
  const value = useContext(InteractionContext);
  if (!value) throw new Error("useDialog must be used inside InteractionProvider");
  return value;
}
function Dialog({ dialog, onClose }) {
  const language = useStore((state) => state.language);
  const en = language === "en";
  const [value, setValue] = useState(dialog.defaultValue || "");
  const isPrompt = dialog.kind === "prompt";
  const isSelect = dialog.kind === "select";
  const submit = () => onClose(isPrompt || isSelect ? value : true);
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(isPrompt || isSelect ? null : false); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="interaction-dialog-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" dir={en ? "ltr" : "rtl"}>
      <div className="flex items-start gap-3 border-b border-slate-100 p-5">
        <div className={`rounded-xl p-2.5 ${dialog.danger ? "bg-red-50 text-red-600" : "bg-indigo-50 text-indigo-600"}`}>{dialog.danger ? <AlertTriangle className="h-5 w-5" /> : isPrompt ? <MessageSquareText className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}</div>
        <div className="min-w-0 flex-1"><h2 id="interaction-dialog-title" className="font-bold text-lg text-slate-900">{dialog.title}</h2><p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600">{dialog.message}</p></div>
        <button onClick={() => onClose(isPrompt ? null : false)} aria-label={en ? "Close" : "إغلاق"} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
      </div>
      {isPrompt && <div className="p-5"><input autoFocus value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }} placeholder={dialog.placeholder} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></div>}
      {isSelect && <div className="p-5"><select autoFocus value={value} onChange={e => setValue(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"><option value="">{en ? "Select an option" : "اختر من القائمة"}</option>{dialog.choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></div>}
      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 p-4"><button onClick={() => onClose(isPrompt ? null : false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">{en ? "Cancel" : "إلغاء"}</button><button onClick={submit} className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${dialog.danger ? "bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700"}`}>{dialog.confirmLabel || (isPrompt || isSelect ? (en ? "Save" : "حفظ") : (en ? "Continue" : "متابعة"))}</button></div>
    </section>
  </div>;
}
