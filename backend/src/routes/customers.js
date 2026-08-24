import { Router } from "express";
import { prisma } from "../index.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res) => {
  try {
    const { search } = req.query;
    const where = { isActive: true };
    if (search) where.OR = [{ name: { contains: search, mode: "insensitive" } }, { phone: { contains: search } }, { email: { contains: search, mode: "insensitive" } }];
    const customers = await prisma.customer.findMany({ where, orderBy: { name: "asc" }, take: 50 });
    res.json(customers);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/", async (req, res) => {
  try {
    const customer = await prisma.customer.create({ data: req.body });
    res.status(201).json(customer);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "رقم الهاتف أو الإيميل موجود بالفعل" });
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const customer = await prisma.customer.update({ where: { id: req.params.id }, data: req.body });
    res.json(customer);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/history", async (req, res) => {
  try {
    const [invoices, repairs] = await prisma.$transaction([
      prisma.invoice.findMany({ where: { customerId: req.params.id }, orderBy: { createdAt: "desc" }, take: 20, include: { _count: { select: { items: true } } } }),
      prisma.repairTicket.findMany({ where: { customerId: req.params.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    ]);
    res.json({ invoices, repairs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
