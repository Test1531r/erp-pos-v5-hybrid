import { Router } from "express";
import { Prisma } from "@prisma/client";
import dayjs from "dayjs";
import { prisma, io } from "../index.js";
import { authenticate } from "../middleware/auth.js";
import { pageParams } from "../utils/security.js";
import { audit } from "../utils/audit.js";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res) => {
  try {
    const { from, to, search } = req.query;
    const { page, limit, skip } = pageParams(req.query, 20, 100);
    const where = req.branchId ? { branchId: req.branchId } : {};
    if (search) where.invoiceNumber = { contains: String(search), mode: "insensitive" };
    if (from || to) { where.createdAt = {}; if (from) where.createdAt.gte = dayjs(from).startOf("day").toDate(); if (to) where.createdAt.lte = dayjs(to).endOf("day").toDate(); }
    const [invoices, total] = await prisma.$transaction([
      prisma.invoice.findMany({ where, include: { cashier: { select: { name: true } }, customer: { select: { name: true } }, _count: { select: { items: true } } }, orderBy: { createdAt: "desc" }, skip, take: limit }),
      prisma.invoice.count({ where }),
    ]);
    res.json({ invoices, total, page, pages: Math.ceil(total / limit) });
  } catch { res.status(500).json({ error: "تعذر تحميل الفواتير" }); }
});

router.get("/:id", async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: { items: true, paymentSplits: { include: { account: { select: { id: true, name: true, type: true } } } }, returns: { where: { status: "COMPLETED" }, include: { items: true } }, cashier: { select: { name: true } }, customer: true, branch: { select: { name: true, address: true, phone: true, taxNumber: true } } } });
  if (!invoice || (req.user.role !== "SUPER_ADMIN" && invoice.branchId !== req.user.branchId)) return res.status(404).json({ error: "الفاتورة غير موجودة" });
  res.json(invoice);
});
router.delete("/:id", async (req, res) => {
  if (req.user.role !== "SUPER_ADMIN") {
    return res.status(403).json({
      error: "حذف الفواتير متاح للمدير العام فقط",
    });
  }

  try {
    const invoiceId = req.params.id;

    const result = await prisma.$transaction(
      async (tx) => {
        const invoice = await tx.invoice.findUnique({
          where: { id: invoiceId },
          include: {
            items: true,
            paymentSplits: {
              include: {
                account: true,
              },
            },
            returns: {
              where: { status: "COMPLETED" },
            },
            receivable: {
              include: {
                installments: true,
                payments: true,
              },
            },
          },
        });

        if (!invoice) {
          throw Object.assign(new Error("الفاتورة غير موجودة"), {
            status: 404,
          });
        }

        // حماية إضافية للفرع
        if (
          req.user.role !== "SUPER_ADMIN" &&
          invoice.branchId !== req.user.branchId
        ) {
          throw Object.assign(new Error("غير مصرح بهذه العملية"), {
            status: 403,
          });
        }

        // لا نحذف فاتورة عليها مرتجع مكتمل
        if (invoice.returns.length > 0) {
          throw Object.assign(
            new Error(
              "لا يمكن حذف هذه الفاتورة لأنها تحتوي على مرتجع مكتمل"
            ),
            { status: 409 }
          );
        }

        // لا نحذف فاتورة آجل تم تحصيل دفعات عليها
        if (
          invoice.receivable &&
          invoice.receivable.payments.length > 0
        ) {
          throw Object.assign(
            new Error(
              "لا يمكن حذف فاتورة آجل تم تسجيل دفعات عليها"
            ),
            { status: 409 }
          );
        }

        // ============================
        // 1) إعادة المنتجات للمخزون
        // ============================

        for (const item of invoice.items) {
          const inventory = await tx.inventory.findUnique({
            where: {
              productId_branchId: {
                productId: item.productId,
                branchId: invoice.branchId,
              },
            },
          });

          if (!inventory) {
            throw Object.assign(
              new Error(
                `تعذر العثور على مخزون المنتج: ${item.productName}`
              ),
              { status: 409 }
            );
          }

          const before = inventory.quantity;
          const after = before + item.quantity;

          await tx.inventory.update({
            where: {
              productId_branchId: {
                productId: item.productId,
                branchId: invoice.branchId,
              },
            },
            data: {
              quantity: {
                increment: item.quantity,
              },
            },
          });

          // نسجل حركة عكس البيع
          await tx.stockMovement.create({
            data: {
              branchId: invoice.branchId,
              productId: item.productId,
              userId: req.user.id,
              type: "ADJUSTMENT_IN",
              quantity: item.quantity,
              quantityBefore: before,
              quantityAfter: after,
              referenceType: "InvoiceDeletion",
              referenceId: invoice.id,
              notes: `حذف الفاتورة ${invoice.invoiceNumber}`,
            },
          });

          // إعادة IMEI إلى المخزون
          if (
            Array.isArray(item.imeiNumbers) &&
            item.imeiNumbers.length > 0
          ) {
            const restored = await tx.productIMEI.updateMany({
              where: {
                productId: item.productId,
                branchId: invoice.branchId,
                saleInvoiceId: invoice.id,
                imei: {
                  in: item.imeiNumbers,
                },
              },
              data: {
                status: "IN_STOCK",
                saleInvoiceId: null,
                soldAt: null,
              },
            });

            if (restored.count !== item.imeiNumbers.length) {
              throw Object.assign(
                new Error(
                  `تعذر إعادة IMEI للمنتج: ${item.productName}`
                ),
                { status: 409 }
              );
            }
          }
        }

        // ============================
        // 2) عكس المدفوعات
        // ============================

        let cashToReverse = new Prisma.Decimal(0);

        for (const split of invoice.paymentSplits) {
          const account = await tx.financialAccount.findUnique({
            where: { id: split.accountId },
          });

          if (!account) {
            throw Object.assign(
              new Error("تعذر العثور على أحد حسابات الدفع"),
              { status: 409 }
            );
          }

          const amount = new Prisma.Decimal(split.amount);
          const before = new Prisma.Decimal(account.balance);
          const after = before.sub(amount);

          if (
            after.lessThan(0) &&
            !account.allowNegative
          ) {
            throw Object.assign(
              new Error(
                `لا يمكن حذف الفاتورة لأن رصيد الحساب "${account.name}" لا يكفي لعكس العملية`
              ),
              { status: 409 }
            );
          }

          await tx.financialAccount.update({
            where: { id: account.id },
            data: {
              balance: after,
            },
          });

          await tx.financialTransaction.create({
            data: {
              branchId: invoice.branchId,
              accountId: account.id,
              userId: req.user.id,
              type: "ADJUSTMENT_OUT",
              amount,
              direction: "OUT",
              balanceBefore: before,
              balanceAfter: after,
              referenceType: "InvoiceDeletion",
              referenceId: invoice.id,
              description: `عكس الفاتورة ${invoice.invoiceNumber}`,
            },
          });

          if (account.type === "CASHBOX") {
            cashToReverse = cashToReverse.add(amount);
          }
        }

        // تحديث رصيد خزينة الفرع
        if (cashToReverse.greaterThan(0)) {
          await tx.branch.update({
            where: { id: invoice.branchId },
            data: {
              cashboxBalance: {
                decrement: cashToReverse,
              },
            },
          });
        }

        // ============================
        // 3) عكس تأثير العميل
        // ============================

        if (invoice.customerId) {
          const customer = await tx.customer.findUnique({
            where: { id: invoice.customerId },
          });

          if (customer) {
            let newTotalSpent = new Prisma.Decimal(
              customer.totalSpent || 0
            ).sub(invoice.total);

            if (newTotalSpent.lessThan(0)) {
              newTotalSpent = new Prisma.Decimal(0);
            }

            const loyaltyRows =
              await tx.loyaltyTransaction.findMany({
                where: {
                  referenceType: "Invoice",
                  referenceId: invoice.id,
                },
              });

            const pointsDelta = loyaltyRows.reduce(
              (sum, row) => sum + Number(row.points || 0),
              0
            );

            let newPoints =
              Number(customer.loyaltyPoints || 0) - pointsDelta;

            if (newPoints < 0) {
              throw Object.assign(
                new Error(
                  "لا يمكن حذف الفاتورة لأن نقاط الولاء الناتجة عنها تم استخدامها لاحقًا"
                ),
                { status: 409 }
              );
            }

            await tx.customer.update({
              where: { id: invoice.customerId },
              data: {
                totalSpent: newTotalSpent,
                loyaltyPoints: newPoints,
              },
            });

            await tx.loyaltyTransaction.deleteMany({
              where: {
                referenceType: "Invoice",
                referenceId: invoice.id,
              },
            });
          }
        }

        // ============================
        // 4) فاتورة CREDIT
        // ============================

        if (invoice.receivable) {
          // لا توجد دفعات لأننا تحققنا منها فوق

          await tx.installment.deleteMany({
            where: {
              receivableId: invoice.receivable.id,
            },
          });

          await tx.customerReceivable.delete({
            where: {
              id: invoice.receivable.id,
            },
          });

          if (invoice.customerId) {
            const customer = await tx.customer.findUnique({
              where: { id: invoice.customerId },
            });

            if (customer) {
              let credit = new Prisma.Decimal(
                customer.creditBalance || 0
              ).sub(invoice.total);

              if (credit.lessThan(0)) {
                credit = new Prisma.Decimal(0);
              }

              await tx.customer.update({
                where: { id: invoice.customerId },
                data: {
                  creditBalance: credit,
                },
              });
            }
          }
        }

        // ============================
        // 5) حذف روابط الفاتورة الأصلية
        // ============================

        await tx.paymentSplit.deleteMany({
          where: {
            invoiceId: invoice.id,
          },
        });

        /*
          لا نحذف StockMovement القديمة ولا FinancialTransaction
          القديمة الخاصة بالبيع.

          مهم جدًا للمراجعة المحاسبية:
          SALE الأصلية تظل موجودة
          + ADJUSTMENT العكسية تظل موجودة.
        */

        await tx.invoiceItem.deleteMany({
          where: {
            invoiceId: invoice.id,
          },
        });

        await tx.invoice.delete({
          where: {
            id: invoice.id,
          },
        });

        return {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          branchId: invoice.branchId,
          items: invoice.items.map((x) => ({
            productId: x.productId,
          })),
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
        timeout: 25000,
      }
    );

    // تحديث المخزون Live
    for (const item of result.items) {
      const inv = await prisma.inventory.findUnique({
        where: {
          productId_branchId: {
            productId: item.productId,
            branchId: result.branchId,
          },
        },
        select: {
          quantity: true,
        },
      });

      io.to(`branch:${result.branchId}`).emit(
        "inventory:update",
        {
          productId: item.productId,
          branchId: result.branchId,
          quantity: inv?.quantity ?? 0,
        }
      );
    }

    // تحديث الحسابات Live
    io.to(`branch:${result.branchId}`).emit(
      "finance:update",
      {
        branchId: result.branchId,
      }
    );

    await audit(
      req.user,
      "DELETE_INVOICE",
      "Invoice",
      result.id,
      {
        invoiceNumber: result.invoiceNumber,
      },
      result.branchId
    );

    res.json({
      message: `تم حذف الفاتورة ${result.invoiceNumber} وإرجاع تأثيرها بنجاح`,
    });
  } catch (err) {
    console.error("[Delete Invoice]", err);

    res.status(err.status || 500).json({
      error:
        err.status
          ? err.message
          : "تعذر حذف الفاتورة",
    });
  }
});
export default router;
