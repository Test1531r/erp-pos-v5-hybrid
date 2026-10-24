import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Building2,
  Users,
  Wallet,
  Boxes,
  Eye,
  Power,
  X,
  RefreshCw,
  TrendingUp,
  RotateCcw,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, useStore } from "../store";
import { useDialog } from "../components/InteractionProvider.jsx";

function Modal({ title, children, footer, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-bold text-lg">{title}</h3>

          <button onClick={onClose}>
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6">{children}</div>

        {footer && (
          <div className="border-t p-5 flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>

    </div>
  );
}

function Btn({
  children,
  onClick,
  variant = "primary",
  type = "button",
}) {
  const cls = {
    primary:
      "bg-indigo-600 hover:bg-indigo-700 text-white",
    secondary:
      "border border-slate-300 hover:bg-slate-100",
    danger:
      "bg-red-600 hover:bg-red-700 text-white",
    success:
      "bg-green-600 hover:bg-green-700 text-white",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      className={`px-4 py-2 rounded-xl transition ${cls[variant]}`}
    >
      {children}
    </button>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      className="w-full border rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
    />
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-semibold text-slate-600">
        {label}
      </label>

      {children}
    </div>
  );
}

export default function Branches() {
  const language = useStore((state) => state.language);
  const en = language === "en";
  const t = (ar, english) => en ? english : ar;
  const { confirm } = useDialog();
  const [loading, setLoading] = useState(false);

  const [branches, setBranches] = useState([]);

  const [search, setSearch] = useState("");

  const [modal, setModal] = useState(null);

  const [selected, setSelected] = useState(null);
  const [staffReport, setStaffReport] = useState(null);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffSearch, setStaffSearch] = useState("");

  const emptyForm = {
    name: "",
    code: "",
    managerName: "",
    phone: "",
    email: "",
    city: "",
    address: "",
    taxNumber: "",
    commercialRegister: "",
    openingBalance: 0,
    cashboxBalance: 0,
    logo: "",
    isActive: true,
  };

  const [form, setForm] = useState(emptyForm);

  async function loadBranches() {
    try {
      setLoading(true);

      const { data } = await api.get("/branches");

      setBranches(Array.isArray(data) ? data : (data.data || []));
    } catch {
      toast.error("فشل تحميل الفروع");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBranches();
  }, []);

  const filtered = useMemo(() => {
    return branches.filter((b) => {
      const s = search.toLowerCase();

      return (
        b.name?.toLowerCase().includes(s) ||
        b.code?.toLowerCase().includes(s) ||
        b.city?.toLowerCase().includes(s)
      );
    });
  }, [branches, search]);

  const stats = {
    branches: branches.length,

    active: branches.filter((x) => x.isActive).length,

    employees: branches.reduce(
      (a, b) => a + (b._count?.users || 0),
      0
    ),

    cash: branches.reduce(
      (a, b) => a + Number(b.cashboxBalance || 0),
      0
    ),
  };

  async function openStaff(branch) {
    setSelected(branch);
    setStaffReport(null);
    setStaffSearch("");
    setModal("staff");
    setStaffLoading(true);
    try {
      const { data } = await api.get(`/branches/${branch.id}/staff`);
      setStaffReport(data?.data || data);
    } catch (err) {
      toast.error(err.response?.data?.error || t("تعذر تحميل بيانات موظفي الفرع", "Could not load branch staff report"));
    } finally {
      setStaffLoading(false);
    }
  }

  const openAdd = () => {
    setForm(emptyForm);
    setModal("add");
  };

  const openEdit = (branch) => {
    setSelected(branch);

    setForm({
      ...branch,
    });

    setModal("edit");
  };
    async function saveBranch() {
    try {
      if (!form.name.trim())
        return toast.error("أدخل اسم الفرع");

      if (!form.code.trim())
        return toast.error("أدخل كود الفرع");

      if (modal === "add") {
        await api.post("/branches", form);
        toast.success("تم إضافة الفرع");
      } else {
        await api.put(`/branches/${selected.id}`, form);
        toast.success("تم تحديث الفرع");
      }

      setModal(null);
      loadBranches();
    } catch (err) {
      toast.error(err.response?.data?.error || "حدث خطأ");
    }
  }

  async function deleteBranch(id) {
    if (!(await confirm(t("حذف الفرع إجراء حساس وقد يؤثر على العمليات المرتبطة به.","Deleting a branch is sensitive and may affect related operations."), { title: t("تأكيد حذف الفرع","Confirm branch deletion"), danger: true, confirmLabel: t("حذف الفرع","Delete branch") }))) return;

    try {
      await api.delete(`/branches/${id}`);
      toast.success(t("تم الحذف","Deleted successfully"));
      loadBranches();
    } catch (err) {
      toast.error(err.response?.data?.error || t("تعذر الحذف","Could not delete branch"));
    }
  }

  async function toggleStatus(branch) {
    try {
      await api.put(`/branches/${branch.id}`, {
        isActive: !branch.isActive,
      });

      toast.success("تم تحديث الحالة");

      loadBranches();
    } catch {
      toast.error("حدث خطأ");
    }
  }

  return (
    <div className="p-6" dir={en ? "ltr" : "rtl"}>

      <div className="flex items-center justify-between mb-6">

        <div>

          <h1 className="text-3xl font-bold text-slate-800">
            إدارة الفروع
          </h1>

        </div>

        <Btn onClick={openAdd}>

          <Plus className="w-4 h-4 inline ml-2"/>

          إضافة فرع

        </Btn>

      </div>

      <div className="grid lg:grid-cols-4 md:grid-cols-2 gap-4 mb-6">

        <div className="bg-white rounded-2xl p-5 shadow border">

          <Building2 className="text-indigo-600 mb-3"/>

          <p className="text-slate-500 text-sm">
            إجمالي الفروع
          </p>

          <h2 className="text-3xl font-bold">
            {stats.branches}
          </h2>

        </div>

        <div className="bg-white rounded-2xl p-5 shadow border">

          <Power className="text-green-600 mb-3"/>

          <p className="text-slate-500 text-sm">
            الفروع النشطة
          </p>

          <h2 className="text-3xl font-bold text-green-600">
            {stats.active}
          </h2>

        </div>

        <div className="bg-white rounded-2xl p-5 shadow border">

          <Users className="text-orange-600 mb-3"/>

          <p className="text-slate-500 text-sm">
            الموظفون
          </p>

          <h2 className="text-3xl font-bold">
            {stats.employees}
          </h2>

        </div>

        <div className="bg-white rounded-2xl p-5 shadow border">

          <Wallet className="text-emerald-600 mb-3"/>

          <p className="text-slate-500 text-sm">
            إجمالي الخزائن
          </p>

          <h2 className="text-3xl font-bold">
            {stats.cash.toLocaleString()}
          </h2>

        </div>

      </div>

      <div className="bg-white rounded-2xl border shadow">

        <div className="p-4 border-b flex gap-3">

          <div className="relative flex-1">

            <Search className="absolute right-3 top-3 w-4 h-4 text-slate-400"/>

            <input

              value={search}

              onChange={(e)=>setSearch(e.target.value)}

              placeholder="بحث باسم الفرع أو المدينة أو الكود"

              className="w-full border rounded-xl py-2 pr-10 px-3"

            />

          </div>

          <button

            onClick={loadBranches}

            className="border rounded-xl px-4"

          >

            <RefreshCw className={loading?"animate-spin":""}/>

          </button>

        </div>

        <div className="overflow-x-auto">

          <table className="w-full">

            <thead>

              <tr className="bg-slate-50 border-b text-sm">

                <th className="p-3 text-right">
                  الفرع
                </th>

                <th className="p-3 text-right">
                  المدينة
                </th>

                <th className="p-3 text-right">
                  المدير
                </th>

                <th className="p-3 text-right">
                  الموظفون
                </th>

                <th className="p-3 text-right">
                  الخزنة
                </th>

                <th className="p-3 text-right">
                  الحالة
                </th>

                <th className="p-3 text-right">
                  الإجراءات
                </th>

              </tr>

            </thead>

            <tbody>

              {filtered.map(branch=>(

                <tr
                  key={branch.id}
                  className="border-b hover:bg-slate-50"
                >

                  <td className="p-3">

                    <div className="font-bold">
                      {branch.name}
                    </div>

                    <div className="text-xs text-slate-500">
                      {branch.code}
                    </div>

                  </td>

                  <td className="p-3">
                    {branch.city||"-"}
                  </td>

                  <td className="p-3">
                    {branch.managerName||"-"}
                  </td>

                  <td className="p-3">
                    {branch._count?.users||0}
                  </td>

                  <td className="p-3 font-semibold">
                    {Number(branch.cashboxBalance).toLocaleString()}
                  </td>

                  <td className="p-3">

                    <span
                      className={`px-3 py-1 rounded-full text-xs ${
                        branch.isActive
                        ?"bg-green-100 text-green-700"
                        :"bg-red-100 text-red-700"
                      }`}
                    >
                      {branch.isActive?"نشط":"معطل"}
                    </span>

                  </td>

                  <td className="p-3 flex gap-2">

                    <button title="عرض الموظفين والأداء" onClick={() => openStaff(branch)}>
                      <Eye className="w-4 h-4 text-indigo-600"/>
                    </button>

                    <button
                      onClick={()=>openEdit(branch)}
                    >
                      <Edit2 className="w-4 h-4 text-blue-600"/>
                    </button>

                    <button
                      onClick={()=>toggleStatus(branch)}
                    >
                      <Power className="w-4 h-4 text-amber-600"/>
                    </button>

                    <button
                      onClick={()=>deleteBranch(branch.id)}
                    >
                      <Trash2 className="w-4 h-4 text-red-600"/>
                    </button>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>
            {(modal === "add" || modal === "edit") && (
        <Modal
          title={modal === "add" ? "إضافة فرع جديد" : "تعديل الفرع"}
          onClose={() => setModal(null)}
          footer={
            <>
              <Btn
                variant="secondary"
                onClick={() => setModal(null)}
              >
                إلغاء
              </Btn>

              <Btn onClick={saveBranch}>
                {modal === "add" ? "إضافة الفرع" : "حفظ التعديلات"}
              </Btn>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-4">

            <Field label="اسم الفرع *">
              <Input
                value={form.name}
                onChange={(e)=>
                  setForm({
                    ...form,
                    name:e.target.value
                  })
                }
              />
            </Field>

            <Field label="كود الفرع *">
              <Input
                value={form.code}
                onChange={(e)=>
                  setForm({
                    ...form,
                    code:e.target.value
                  })
                }
              />
            </Field>

            <Field label="اسم المدير">
              <Input
                value={form.managerName}
                onChange={(e)=>
                  setForm({
                    ...form,
                    managerName:e.target.value
                  })
                }
              />
            </Field>

            <Field label="رقم الهاتف">
              <Input
                value={form.phone}
                onChange={(e)=>
                  setForm({
                    ...form,
                    phone:e.target.value
                  })
                }
              />
            </Field>

            <Field label="البريد الإلكتروني">
              <Input
                type="email"
                value={form.email}
                onChange={(e)=>
                  setForm({
                    ...form,
                    email:e.target.value
                  })
                }
              />
            </Field>

            <Field label="المدينة">
              <Input
                value={form.city}
                onChange={(e)=>
                  setForm({
                    ...form,
                    city:e.target.value
                  })
                }
              />
            </Field>

            <div className="col-span-2">

              <Field label="العنوان">

                <Input
                  value={form.address}
                  onChange={(e)=>
                    setForm({
                      ...form,
                      address:e.target.value
                    })
                  }
                />

              </Field>

            </div>

            <Field label="السجل التجاري">

              <Input
                value={form.commercialRegister}
                onChange={(e)=>
                  setForm({
                    ...form,
                    commercialRegister:e.target.value
                  })
                }
              />

            </Field>

            <Field label="الرقم الضريبي">

              <Input
                value={form.taxNumber}
                onChange={(e)=>
                  setForm({
                    ...form,
                    taxNumber:e.target.value
                  })
                }
              />

            </Field>

            <Field label="الرصيد الافتتاحي">

              <Input
                type="number"
                value={form.openingBalance}
                onChange={(e)=>
                  setForm({
                    ...form,
                    openingBalance:e.target.value
                  })
                }
              />

            </Field>

            <Field label="رصيد الخزنة">

              <Input
                type="number"
                value={form.cashboxBalance}
                onChange={(e)=>
                  setForm({
                    ...form,
                    cashboxBalance:e.target.value
                  })
                }
              />

            </Field>

            <div className="col-span-2">

              <Field label="رابط شعار الفرع">

                <Input
                  placeholder="https://..."
                  value={form.logo}
                  onChange={(e)=>
                    setForm({
                      ...form,
                      logo:e.target.value
                    })
                  }
                />

              </Field>

            </div>

            <div className="col-span-2">

              <label className="flex items-center gap-3">

                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e)=>
                    setForm({
                      ...form,
                      isActive:e.target.checked
                    })
                  }
                />

                <span>
                  الفرع مفعل
                </span>

              </label>

            </div>

          </div>
        </Modal>
      )}
            {modal === "view" && selected && (
        <Modal
          title={`بيانات الفرع - ${selected.name}`}
          onClose={() => {
            setModal(null);
            setSelected(null);
          }}
          footer={
            <Btn
              variant="secondary"
              onClick={() => {
                setModal(null);
                setSelected(null);
              }}
            >
              إغلاق
            </Btn>
          }
        >
          <div className="space-y-5">

            <div className="flex items-center gap-5">

              <div className="w-24 h-24 rounded-2xl bg-slate-100 overflow-hidden border flex items-center justify-center">

                {selected.logo ? (
                  <img
                    src={selected.logo}
                    alt={selected.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Building2 className="w-10 h-10 text-slate-400" />
                )}

              </div>

              <div>

                <h2 className="text-2xl font-bold">
                  {selected.name}
                </h2>

                <p className="text-slate-500">
                  {selected.code}
                </p>

              </div>

            </div>

            <div className="grid grid-cols-2 gap-4">

              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500">
                  المدير
                </p>

                <p className="font-semibold">
                  {selected.managerName || "-"}
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500">
                  الهاتف
                </p>

                <p className="font-semibold">
                  {selected.phone || "-"}
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500">
                  البريد الإلكتروني
                </p>

                <p className="font-semibold">
                  {selected.email || "-"}
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500">
                  المدينة
                </p>

                <p className="font-semibold">
                  {selected.city || "-"}
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 col-span-2">
                <p className="text-xs text-slate-500">
                  العنوان
                </p>

                <p className="font-semibold">
                  {selected.address || "-"}
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500">
                  السجل التجاري
                </p>

                <p className="font-semibold">
                  {selected.commercialRegister || "-"}
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500">
                  الرقم الضريبي
                </p>

                <p className="font-semibold">
                  {selected.taxNumber || "-"}
                </p>
              </div>

              <div className="bg-green-50 rounded-xl p-4">
                <p className="text-xs text-green-600">
                  رصيد الخزنة
                </p>

                <p className="font-bold text-xl text-green-700">
                  {Number(selected.cashboxBalance).toLocaleString()}
                </p>
              </div>

              <div className="bg-blue-50 rounded-xl p-4">
                <p className="text-xs text-blue-600">
                  الرصيد الافتتاحي
                </p>

                <p className="font-bold text-xl text-blue-700">
                  {Number(selected.openingBalance).toLocaleString()}
                </p>
              </div>

              <div className="bg-orange-50 rounded-xl p-4">
                <p className="text-xs text-orange-600">
                  عدد الموظفين
                </p>

                <p className="font-bold text-xl">
                  {selected._count?.users || 0}
                </p>
              </div>

              <div className="bg-purple-50 rounded-xl p-4">
                <p className="text-xs text-purple-600">
                  عدد المنتجات
                </p>

                <p className="font-bold text-xl">
                  {selected._count?.inventory || 0}
                </p>
              </div>

            </div>

          </div>
        </Modal>
      )}

      {modal === "staff" && selected && (
        <Modal
          title={t("لوحة أداء الفرع", "Branch performance dashboard") + " — " + selected.name}
          onClose={() => { setModal(null); setSelected(null); setStaffReport(null); }}
          footer={<Btn variant="secondary" onClick={() => { setModal(null); setSelected(null); setStaffReport(null); }}>{t("إغلاق", "Close")}</Btn>}
        >
          <div className="space-y-5 max-h-[72vh] overflow-y-auto">
            <div className="rounded-2xl bg-gradient-to-l from-slate-900 to-indigo-900 text-white p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-white/70 text-sm">{selected.code} {selected.city ? "• " + selected.city : ""}</div>
                <h2 className="text-2xl font-bold mt-1">{selected.name}</h2>
                <div className="mt-2 text-sm text-white/80">{t("تقرير الموظفين والمبيعات والاسترجاعات", "Staff, sales and returns report")}</div>
              </div>
              <span className={`rounded-full px-3 py-1 text-sm ${selected.isActive ? "bg-emerald-400/20 text-emerald-100" : "bg-red-400/20 text-red-100"}`}>
                {selected.isActive ? t("فرع نشط", "Active branch") : t("فرع معطل", "Inactive branch")}
              </span>
            </div>
            {staffLoading ? <div className="py-12 text-center text-slate-500"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3"/>{t("جاري تحميل التقرير...", "Loading report...")}</div> : staffReport ? (() => {
              const employees = Array.isArray(staffReport.employees) ? staffReport.employees : [];
              const visible = employees.filter(e => [e.name, e.username, e.email, e.role].some(v => String(v || "").toLowerCase().includes(staffSearch.toLowerCase())));
              const sum = (key) => employees.reduce((total, e) => total + Number(e[key] || 0), 0);
              const money = (value) => Number(value || 0).toLocaleString(en ? "en-US" : "ar-EG", { maximumFractionDigits: 2 });
              const cards = [
                { label: t("عدد الموظفين", "Employees"), value: employees.length, icon: Users, color: "text-indigo-600", bg: "bg-indigo-50" },
                { label: t("عمليات البيع", "Sales transactions"), value: sum("salesCount"), icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
                { label: t("عمليات الاسترجاع", "Return transactions"), value: sum("returnsCount"), icon: RotateCcw, color: "text-amber-600", bg: "bg-amber-50" },
                { label: t("صافي المبيعات", "Net sales"), value: money(sum("salesTotal") - sum("returnsTotal")) + " ج", icon: Wallet, color: "text-sky-600", bg: "bg-sky-50" },
              ];
              return <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  {cards.map(card => <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3"><span className="text-sm text-slate-500">{card.label}</span><span className={`rounded-lg p-2 ${card.bg}`}><card.icon className={`w-5 h-5 ${card.color}`}/></span></div>
                    <div className="text-2xl font-bold text-slate-800 mt-3">{card.value}</div>
                  </div>)}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4"><div className="text-sm text-emerald-700">{t("إجمالي المبيعات", "Gross sales")}</div><div className="font-bold text-xl text-emerald-800 mt-1">{money(sum("salesTotal"))} ج</div></div>
                  <div className="rounded-xl bg-amber-50 border border-amber-100 p-4"><div className="text-sm text-amber-700">{t("قيمة الاسترجاعات", "Returns value")}</div><div className="font-bold text-xl text-amber-800 mt-1">{money(sum("returnsTotal"))} ج</div></div>
                  <div className="rounded-xl bg-sky-50 border border-sky-100 p-4"><div className="text-sm text-sky-700">{t("متوسط قيمة البيع", "Average sale")}</div><div className="font-bold text-xl text-sky-800 mt-1">{money(sum("salesCount") ? sum("salesTotal") / sum("salesCount") : 0)} ج</div></div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between"><div><h3 className="font-bold text-lg text-slate-800">{t("الموظفون وأداؤهم", "Staff performance")}</h3><p className="text-sm text-slate-500">{t("تاريخ إنشاء الحساب ظاهر كمرجع متاح؛ تاريخ النقل الفعلي للفرع غير مسجل في النظام الحالي.", "Account creation date is shown; historical branch assignment date is not stored in the current schema.")}</p></div><div className="relative sm:w-64"><Search className="absolute right-3 top-3 w-4 h-4 text-slate-400"/><input value={staffSearch} onChange={e => setStaffSearch(e.target.value)} placeholder={t("ابحث عن موظف...", "Search staff...")} className="w-full border rounded-xl py-2 pr-9 pl-3"/></div></div>
                <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[1000px] text-sm"><thead className="bg-slate-50 text-slate-600"><tr>{[t("الموظف", "Employee"),t("الدور", "Role"),t("تاريخ إنشاء الحساب", "Account created"),t("آخر دخول", "Last login"),t("المبيعات", "Sales"),t("قيمة المبيعات", "Sales value"),t("الاسترجاعات", "Returns"),t("قيمة الاسترجاع", "Return value"),t("الصافي", "Net")].map(h=><th key={h} className="p-3 text-right font-semibold whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{visible.map(employee=><tr key={employee.id} className="border-t hover:bg-slate-50"><td className="p-3"><div className="font-bold text-slate-800">{employee.name}</div><div className="text-xs text-slate-500">{employee.username}{employee.email ? " • "+employee.email : ""}</div></td><td className="p-3 whitespace-nowrap">{employee.role}</td><td className="p-3 whitespace-nowrap">{employee.createdAt ? new Date(employee.createdAt).toLocaleDateString(en ? "en-US" : "ar-EG") : "—"}</td><td className="p-3 whitespace-nowrap">{employee.lastLoginAt ? new Date(employee.lastLoginAt).toLocaleDateString(en ? "en-US" : "ar-EG") : "—"}</td><td className="p-3">{employee.salesCount}</td><td className="p-3 font-semibold">{money(employee.salesTotal)} ج</td><td className="p-3">{employee.returnsCount}</td><td className="p-3 font-semibold text-amber-700">{money(employee.returnsTotal)} ج</td><td className="p-3 font-bold text-emerald-700">{money(employee.netSales)} ج</td></tr>)}{visible.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-500">{t("لا يوجد موظفون مطابقون للبحث", "No matching employees")}</td></tr>}</tbody></table></div>
              </>;
            })() : <div className="py-10 text-center text-slate-500">{t("لا توجد بيانات لعرضها", "No report data available")}</div>}
          </div>
        </Modal>
      )}
    </div>
  );
}