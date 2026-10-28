import { Router } from "express";
import { prisma } from "../index.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = Router();

router.use(authenticate);

/* ===========================
   Helpers
=========================== */

function buildSearch(search) {
  if (!search) return {};

  return {
    OR: [
      {
        name: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        code: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        city: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        phone: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        managerName: {
          contains: search,
          mode: "insensitive",
        },
      },
    ],
  };
}

async function writeAudit(user, action, entity, entityId, details) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        branchId: user.branchId,
        action,
        entity,
        entityId,
        details: JSON.stringify(details || {}),
      },
    });
  } catch (e) {
    console.error("Audit Error:", e.message);
  }
}

/* ===========================
   Get All Branches
=========================== */

router.get("/", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1"), 1);
    const limit = Math.min(parseInt(req.query.limit || "20"), 100);

    const skip = (page - 1) * limit;

    const search = req.query.q?.trim() || "";

    const where = {
      ...(req.user.role === "SUPER_ADMIN"
        ? {}
        : {
            id: req.user.branchId,
          }),

      ...buildSearch(search),
    };

    const [branches, total] = await Promise.all([
      prisma.branch.findMany({
        where,

        skip,

        take: limit,

        orderBy: {
          name: "asc",
        },

        include: {
          _count: {
            select: {
              users: true,
              inventory: true,
              invoices: true,
              repairTickets: true,
              expenses: true,
            },
          },
        },
      }),

      prisma.branch.count({
        where,
      }),
    ]);

    res.json({
      success: true,

      data: branches,

      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/* ===========================
   Branch Staff Performance
=========================== */
router.get("/:id/staff", async (req, res) => {
  try {
    const branchId = req.params.id;
    if (req.user.role !== "SUPER_ADMIN" && req.user.branchId !== branchId) return res.status(403).json({ success: false, error: "ليس لديك صلاحية" });
    const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true, code: true, city: true, isActive: true } });
    if (!branch) return res.status(404).json({ success: false, error: "الفرع غير موجود" });
    const staff = await prisma.user.findMany({
      where: { branchId },
      select: { id: true, name: true, username: true, email: true, role: true, isActive: true, createdAt: true, lastLoginAt: true,
        invoices: { where: { branchId }, select: { id: true, total: true } },
        saleReturns: { where: { branchId, status: "COMPLETED" }, select: { id: true, total: true } },
      }, orderBy: { name: "asc" },
    });
    const employees = staff.map(({ invoices, saleReturns, ...employee }) => {
      const salesTotal = invoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
      const returnsTotal = saleReturns.reduce((sum, item) => sum + Number(item.total || 0), 0);
      return { ...employee, salesCount: invoices.length, salesTotal, returnsCount: saleReturns.length, returnsTotal, netSales: salesTotal - returnsTotal };
    });
    res.json({ success: true, data: { branch, employees } });
  } catch (err) {
    console.error("Branch staff report error:", err);
    res.status(500).json({ success: false, error: "تعذر تحميل تقرير موظفي الفرع" });
  }
});

/* ===========================
   Branch Statistics
=========================== */

router.get("/:id/stats", async (req, res) => {
  try {
    const branchId = req.params.id;

    if (
      req.user.role !== "SUPER_ADMIN" &&
      req.user.branchId !== branchId
    ) {
      return res.status(403).json({
        success: false,
        error: "ليس لديك صلاحية",
      });
    }

    const [
      users,
      inventory,
      invoices,
      repairs,
      expenses,
    ] = await Promise.all([
      prisma.user.count({
        where: {
          branchId,
        },
      }),

      prisma.inventory.count({
        where: {
          branchId,
        },
      }),

      prisma.invoice.count({
        where: {
          branchId,
        },
      }),

      prisma.repairTicket.count({
        where: {
          branchId,
        },
      }),

      prisma.expense.aggregate({
        where: {
          branchId,
        },

        _sum: {
          amount: true,
        },
      }),
    ]);

    res.json({
      success: true,

      data: {
        users,
        inventoryItems: inventory,
        invoices,
        repairs,
        expenses: Number(expenses._sum.amount || 0),
      },
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ===========================
// END OF PART 1
// CONTINUE FROM HERE (PART 2)
// ===========================
/* ===========================
   Get Branch By ID
=========================== */

router.get("/:id", async (req, res) => {
  try {
    const branchId = req.params.id;

    if (
      req.user.role !== "SUPER_ADMIN" &&
      req.user.branchId !== branchId
    ) {
      return res.status(403).json({
        success: false,
        error: "ليس لديك صلاحية",
      });
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      include: {
        _count: {
          select: {
            users: true,
            inventory: true,
            invoices: true,
            repairTickets: true,
            expenses: true,
          },
        },
      },
    });

    if (!branch) {
      return res.status(404).json({
        success: false,
        error: "الفرع غير موجود",
      });
    }

    res.json({
      success: true,
      data: branch,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/* ===========================
   Create Branch
=========================== */

router.post("/", authorize("SUPER_ADMIN"), async (req, res) => {
  try {
    const {
      name,
      code,
      address,
      city,
      phone,
      email,
      managerName,
      taxNumber,
      commercialRegister,
      logo,
    } = req.body;

    if (!name || !code) {
      return res.status(400).json({
        success: false,
        error: "اسم الفرع والكود مطلوبان",
      });
    }

    const exists = await prisma.branch.findFirst({
      where: {
        OR: [
          { code },
          { name },
        ],
      },
    });

    if (exists) {
      return res.status(409).json({
        success: false,
        error: "الفرع موجود بالفعل",
      });
    }

    const branch = await prisma.branch.create({
      data: {
        name,
        code,
        address,
        city,
        phone,
        email,
        managerName,
        taxNumber,
        commercialRegister,
        logo,
      },
    });

    await writeAudit(
      req.user,
      "CREATE",
      "BRANCH",
      branch.id,
      branch
    );

    res.status(201).json({
      success: true,
      data: branch,
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/* ===========================
   Update Branch
=========================== */

router.put("/:id", authorize("SUPER_ADMIN"), async (req, res) => {
  try {

    const id = req.params.id;

    const oldBranch = await prisma.branch.findUnique({
      where: { id },
    });

    if (!oldBranch) {
      return res.status(404).json({
        success: false,
        error: "الفرع غير موجود",
      });
    }

    const allowed = ["name", "code", "address", "city", "phone", "email", "managerName", "taxNumber", "commercialRegister", "logo", "isActive"];
    const data = {};
    for (const key of allowed) if (req.body[key] !== undefined) data[key] = req.body[key];
    if (data.code) data.code = String(data.code).trim().toUpperCase();
    if (data.name) data.name = String(data.name).trim();

    const branch = await prisma.branch.update({
      where: { id },
      data,
    });

    await writeAudit(
      req.user,
      "UPDATE",
      "BRANCH",
      id,
      {
        before: oldBranch,
        after: branch,
      }
    );

    res.json({
      success: true,
      data: branch,
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });

  }
});

/* ===========================
   Soft Delete Branch
=========================== */

router.delete("/:id", authorize("SUPER_ADMIN"), async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await prisma.branch.findUnique({
      where: { id },
      select: { id: true, name: true, isActive: true },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "الفرع غير موجود",
      });
    }

    // This endpoint archives a branch; it must not delete historical data.
    // Linked users, stock and invoices are expected and remain intact.
    const branch = await prisma.branch.update({
      where: { id },
      data: { isActive: false },
    });

    await writeAudit(req.user, "ARCHIVE", "BRANCH", id, {
      name: branch.name,
      wasActive: existing.isActive,
      isActive: branch.isActive,
    });

    return res.json({
      success: true,
      message: "تم إيقاف الفرع بنجاح مع الاحتفاظ بجميع بياناته السابقة",
      data: { id: branch.id, name: branch.name, isActive: branch.isActive },
    });
  } catch (err) {
    console.error("Branch archive error:", err);
    return res.status(500).json({
      success: false,
      error: "تعذر إيقاف الفرع",
    });
  }
});

export default router;