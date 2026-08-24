import { Prisma } from "@prisma/client";

export const PAYMENT_ACCOUNT_TYPE = {
  CASH: "CASHBOX",
  CARD: "CARD",
  BANK_TRANSFER: "BANK",
  VODAFONE_CASH: "VODAFONE_CASH",
  INSTAPAY: "INSTAPAY",
};

export const DEFAULT_ACCOUNTS = [
  { code: "CASH", name: "الخزنة النقدية", type: "CASHBOX" },
  { code: "CARD", name: "بطاقات الدفع", type: "CARD" },
  { code: "BANK", name: "الحساب البنكي", type: "BANK" },
  { code: "VODAFONE", name: "Vodafone Cash", type: "VODAFONE_CASH" },
  { code: "INSTAPAY", name: "InstaPay", type: "INSTAPAY" },
];

export async function ensureDefaultAccounts(tx, branchId) {
  const out = [];
  for (const row of DEFAULT_ACCOUNTS) {
    const account = await tx.financialAccount.upsert({
      where: { branchId_code: { branchId, code: row.code } },
      create: { ...row, branchId },
      update: {},
    });
    out.push(account);
  }
  return out;
}

export async function resolvePaymentAccount(tx, branchId, method, accountId) {
  if (accountId) {
    const account = await tx.financialAccount.findFirst({ where: { id: accountId, branchId, isActive: true } });
    if (!account) throw Object.assign(new Error("الحساب المالي غير موجود أو غير فعال"), { status: 422 });
    return account;
  }
  const type = PAYMENT_ACCOUNT_TYPE[method];
  if (!type) throw Object.assign(new Error("يجب تحديد الحساب المالي لطريقة الدفع هذه"), { status: 422 });
  await ensureDefaultAccounts(tx, branchId);
  const account = await tx.financialAccount.findFirst({ where: { branchId, type, isActive: true }, orderBy: { createdAt: "asc" } });
  if (!account) throw Object.assign(new Error("تعذر تحديد الحساب المالي"), { status: 422 });
  return account;
}

export async function postMovement(tx, {
  branchId, accountId, userId, type, amount, direction,
  referenceType = null, referenceId = null, transferGroupId = null,
  description = null, notes = null,
}) {
  const value = new Prisma.Decimal(amount);
  if (!value.greaterThan(0)) throw Object.assign(new Error("قيمة الحركة يجب أن تكون أكبر من صفر"), { status: 400 });
  if (!["IN", "OUT"].includes(direction)) throw Object.assign(new Error("اتجاه الحركة غير صالح"), { status: 400 });

  const account = await tx.financialAccount.findFirst({ where: { id: accountId, branchId, isActive: true } });
  if (!account) throw Object.assign(new Error("الحساب المالي غير موجود أو غير فعال"), { status: 404 });
  const before = new Prisma.Decimal(account.balance);
  const after = direction === "IN" ? before.add(value) : before.sub(value);
  if (direction === "OUT" && after.lessThan(0) && !account.allowNegative) {
    throw Object.assign(new Error(`رصيد حساب "${account.name}" غير كافٍ. المتاح ${before.toFixed(2)}`), { status: 422 });
  }

  await tx.financialAccount.update({ where: { id: account.id }, data: { balance: after } });
  const movement = await tx.financialTransaction.create({
    data: {
      branchId, accountId: account.id, userId: userId || null, type, amount: value,
      direction, balanceBefore: before, balanceAfter: after,
      referenceType, referenceId, transferGroupId,
      description: description ? String(description).slice(0, 500) : null,
      notes: notes ? String(notes).slice(0, 1000) : null,
    },
  });
  return { movement, account: { ...account, balance: after } };
}
