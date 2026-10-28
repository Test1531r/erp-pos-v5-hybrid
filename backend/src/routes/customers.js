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

router.get("/:id/summary", async (req, res) => {
  try {
    const customerId = req.params.id;
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 100,
          include: {
            branch: { select: { name: true } },
            paymentSplits: { include: { account: { select: { name: true, type: true } } } },
            returns: { where: { status: "COMPLETED" }, select: { total: true, returnNumber: true, createdAt: true } },
            items: { select: { id: true, productName: true, quantity: true, lineTotal: true } },
          },
        },
        receivables: {
          orderBy: { createdAt: "desc" },
          take: 100,
          include: {
            branch: { select: { name: true } },
            invoice: { select: { invoiceNumber: true } },
            installments: { orderBy: { dueDate: "asc" } },
            payments: { orderBy: { createdAt: "desc" }, take: 20, include: { branch: { select: { name: true } }, user: { select: { name: true } } } },
          },
        },
        repairTickets: { orderBy: { createdAt: "desc" }, take: 50, include: { branch: { select: { name: true } } } },
        tradeIns: { orderBy: { createdAt: "desc" }, take: 50, include: { branch: { select: { name: true } }, user: { select: { name: true } } } },
        loyaltyTransactions: { orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { name: true } } } },
      },
    });
    if (!customer) return res.status(404).json({ error: "العميل غير موجود" });

    const [invoiceStats, repairCount] = await prisma.$transaction([
      prisma.invoice.aggregate({ where: { customerId }, _count: { _all: true }, _sum: { total: true, amountPaid: true } }),
      prisma.repairTicket.count({ where: { customerId } }),
    ]);
    const completedReturns = customer.invoices.flatMap((invoice) => invoice.returns || []);
    const returnedTotal = completedReturns.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const paymentChannels = {};
    for (const invoice of customer.invoices) {
      for (const split of invoice.paymentSplits || []) {
        const key = split.method || "OTHER";
        if (!paymentChannels[key]) paymentChannels[key] = { method: key, count: 0, amount: 0 };
        paymentChannels[key].count += 1;
        paymentChannels[key].amount += Number(split.amount || 0);
      }
    }
    const openReceivables = customer.receivables.filter((r) => !["PAID", "CANCELLED"].includes(r.status));
    res.json({
      customer: { ...customer, repairs: customer.repairTickets },
      summary: {
        invoiceCount: invoiceStats._count._all,
        grossPurchases: Number(invoiceStats._sum.total || 0),
        paidAtSale: Number(invoiceStats._sum.amountPaid || 0),
        returnedTotal,
        netPurchases: Number(invoiceStats._sum.total || 0) - returnedTotal,
        outstandingCredit: openReceivables.reduce((sum, r) => sum + Number(r.remaining || 0), 0),
        receivableCount: customer.receivables.length,
        paymentCount: customer.receivables.reduce((sum, r) => sum + r.payments.length, 0),
        repairCount,
        tradeInCount: customer.tradeIns.length,
        loyaltyPoints: customer.loyaltyPoints || 0,
        loyaltyEarned: customer.loyaltyTransactions.filter((x) => x.points > 0).reduce((sum, x) => sum + x.points, 0),
        loyaltyRedeemed: Math.abs(customer.loyaltyTransactions.filter((x) => x.points < 0).reduce((sum, x) => sum + x.points, 0)),
        paymentChannels: Object.values(paymentChannels).sort((a, b) => b.amount - a.amount),
      },
    });
  } catch (err) {
    console.error("Customer summary failed:", err);
    res.status(500).json({ error: "تعذر تحميل ملخص العميل" });
  }
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
