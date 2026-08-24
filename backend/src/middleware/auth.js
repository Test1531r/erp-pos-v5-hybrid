import jwt from "jsonwebtoken";
import { prisma } from "../index.js";

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "غير مصرح - يرجى تسجيل الدخول" });
    const token = header.slice(7).trim();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, name: true, username: true, role: true, branchId: true, isActive: true, permissions: true, maxDiscountPct: true },
    });
    if (!user?.isActive) return res.status(401).json({ error: "المستخدم غير موجود أو معطل" });

    req.user = user;
    const requestedBranchId = req.get("x-branch-id") || req.query.branchId || null;
    req.branchId = user.role === "SUPER_ADMIN" ? (requestedBranchId || user.branchId || null) : user.branchId;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") return res.status(401).json({ error: "انتهت صلاحية الجلسة", code: "TOKEN_EXPIRED" });
    return res.status(401).json({ error: "رمز المصادقة غير صالح" });
  }
}

export function authorize(...roles) {
  return (req, res, next) => roles.includes(req.user?.role)
    ? next()
    : res.status(403).json({ error: "ليس لديك صلاحية لتنفيذ هذه العملية" });
}

export function requireBranch(req, res, next) {
  if (!req.branchId) return res.status(400).json({ error: "يجب تحديد الفرع أولاً" });
  next();
}

export function canAccessBranch(req, branchId) {
  return req.user?.role === "SUPER_ADMIN" || req.user?.branchId === branchId;
}
