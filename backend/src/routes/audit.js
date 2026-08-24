import { Router } from "express";
import { prisma } from "../index.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const branchId = req.user.role === "SUPER_ADMIN" ? req.query.branchId : req.user.branchId;
    const where = branchId ? { branchId } : {};
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [logs, total] = await prisma.$transaction([
      prisma.auditLog.findMany({ where, include: { user: { select: { name: true, username: true } } }, orderBy: { createdAt: "desc" }, skip, take: parseInt(limit) }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ logs, total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
