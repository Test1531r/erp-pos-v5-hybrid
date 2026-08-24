import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../index.js";
import { authenticate } from "../middleware/auth.js";
import { audit } from "../utils/audit.js";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    if (!username || !password) return res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبان" });

    const user = await prisma.user.findUnique({
      where: { username },
      include: { branch: { select: { id: true, name: true, code: true, cashboxBalance: true, isActive: true } } },
    });
    if (!user?.isActive || (user.branch && !user.branch.isActive)) return res.status(401).json({ error: "بيانات الدخول غير صحيحة أو الحساب غير فعال" });
    if (!(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "12h", issuer: "erp-pos" });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(user, "LOGIN", "User", user.id, { username: user.username });

    res.json({
      token,
      user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role, branchId: user.branchId, branch: user.branch, permissions: user.permissions, maxDiscountPct: user.maxDiscountPct },
    });
  } catch (err) {
    console.error("[Login]", err);
    res.status(500).json({ error: "تعذر تسجيل الدخول" });
  }
});

router.get("/me", authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, name: true, username: true, email: true, role: true, branchId: true, lastLoginAt: true, permissions: true, maxDiscountPct: true, branch: { select: { id: true, name: true, code: true, cashboxBalance: true, isActive: true } } },
  });
  res.json(user);
});

router.post("/change-password", authenticate, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");
  if (newPassword.length < 10) return res.status(400).json({ error: "كلمة المرور الجديدة يجب ألا تقل عن 10 أحرف" });
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) return res.status(400).json({ error: "كلمة المرور الحالية غير صحيحة" });
  await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
  await audit(req.user, "CHANGE_PASSWORD", "User", req.user.id);
  res.json({ message: "تم تغيير كلمة المرور بنجاح" });
});

export default router;
