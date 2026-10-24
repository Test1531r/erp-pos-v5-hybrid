import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../index.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { audit } from "../utils/audit.js";

const router = Router();
router.use(authenticate);
const managerAllowedRoles = new Set(["CASHIER", "INVENTORY_MANAGER", "ACCOUNTANT", "TECHNICIAN"]);
const validRoles = new Set(["SUPER_ADMIN", "BRANCH_MANAGER", "CASHIER", "INVENTORY_MANAGER", "ACCOUNTANT", "TECHNICIAN"]);

router.get("/", authorize("SUPER_ADMIN"), async (req, res) => {
  const where = req.user.role === "BRANCH_MANAGER" ? { branchId: req.user.branchId } : {};
  const users = await prisma.user.findMany({ where, select: { id: true, name: true, username: true, email: true, role: true, branchId: true, isActive: true, lastLoginAt: true, permissions: true, maxDiscountPct: true, branch: { select: { name: true } } }, orderBy: { name: "asc" } });
  res.json(users);
});

router.post("/", authorize("SUPER_ADMIN", "BRANCH_MANAGER"), async (req, res) => {
  try {
    const { name, username, email, password, role = "CASHIER", branchId } = req.body;
    if (!String(name || "").trim() || !String(username || "").trim()) return res.status(400).json({ error: "الاسم واسم المستخدم مطلوبان" });
    if (!validRoles.has(role)) return res.status(400).json({ error: "الدور الوظيفي غير صالح" });
    if (req.user.role === "SUPER_ADMIN" && req.body.maxDiscountPct !== undefined && (!Number.isFinite(Number(req.body.maxDiscountPct)) || Number(req.body.maxDiscountPct) < 0 || Number(req.body.maxDiscountPct) > 100)) return res.status(400).json({ error: "حد الخصم يجب أن يكون بين 0 و100" });
    if (branchId && !(await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } }))) return res.status(400).json({ error: "الفرع المحدد غير موجود" });
    if (String(password || "").length < 10) return res.status(400).json({ error: "كلمة المرور يجب ألا تقل عن 10 أحرف" });
    
    const effectiveBranchId = branchId || null;
    const user = await prisma.user.create({ data: { name: String(name).trim(), username: String(username).trim(), email: email || null, passwordHash: await bcrypt.hash(password, 12), role, branchId: effectiveBranchId, permissions: req.user.role === "SUPER_ADMIN" && req.body.permissions !== undefined ? req.body.permissions : undefined, maxDiscountPct: req.user.role === "SUPER_ADMIN" && req.body.maxDiscountPct !== undefined ? Number(req.body.maxDiscountPct) : 15 }, select: { id: true, name: true, username: true, role: true, branchId: true, isActive: true, permissions: true, maxDiscountPct: true } });
    await audit(req.user, "CREATE", "User", user.id, { username: user.username, role: user.role }, effectiveBranchId);
    res.status(201).json(user);
  } catch (err) { if (err.code === "P2002") return res.status(409).json({ error: "اسم المستخدم أو الإيميل موجود بالفعل" }); res.status(500).json({ error: "تعذر إنشاء المستخدم" }); }
});

router.put("/:id", authorize("SUPER_ADMIN", "BRANCH_MANAGER"), async (req, res) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true, branchId: true } });
    if (!target) return res.status(404).json({ error: "المستخدم غير موجود" });
    
    if (req.body.role && !validRoles.has(req.body.role)) return res.status(400).json({ error: "الدور الوظيفي غير صالح" });
    if (req.body.branchId && !(await prisma.branch.findUnique({ where: { id: req.body.branchId }, select: { id: true } }))) return res.status(400).json({ error: "الفرع المحدد غير موجود" });
    
    if (req.params.id === req.user.id && req.body.isActive === false) return res.status(400).json({ error: "لا يمكنك تعطيل حسابك الحالي" });
    const data = {};
    for (const key of ["name", "email", "isActive"]) if (req.body[key] !== undefined) data[key] = req.body[key];
    if (req.body.role) data.role = req.body.role; if (req.body.branchId !== undefined) data.branchId = req.body.branchId || null; if (req.body.permissions !== undefined) data.permissions = req.body.permissions;
    if (req.body.maxDiscountPct !== undefined) { if (!Number.isFinite(Number(req.body.maxDiscountPct)) || Number(req.body.maxDiscountPct) < 0 || Number(req.body.maxDiscountPct) > 100) return res.status(400).json({ error: "حد الخصم يجب أن يكون بين 0 و100" }); data.maxDiscountPct = Number(req.body.maxDiscountPct); }
    if (req.body.password) { if (String(req.body.password).length < 10) return res.status(400).json({ error: "كلمة المرور يجب ألا تقل عن 10 أحرف" }); data.passwordHash = await bcrypt.hash(req.body.password, 12); }
    const user = await prisma.user.update({ where: { id: req.params.id }, data, select: { id: true, name: true, username: true, role: true, branchId: true, isActive: true, permissions: true, maxDiscountPct: true } });
    await audit(req.user, "UPDATE", "User", user.id, { role: user.role, isActive: user.isActive }, user.branchId);
    res.json(user);
  } catch { res.status(500).json({ error: "تعذر تحديث المستخدم" }); }
});
export default router;
