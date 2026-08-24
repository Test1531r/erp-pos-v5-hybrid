import { prisma } from "../index.js";

export async function audit(user, action, entity, entityId = null, details = null, branchId = null) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        branchId: branchId || user?.branchId || null,
        action,
        entity,
        entityId,
        details: details == null ? null : JSON.stringify(details),
      },
    });
  } catch (err) {
    console.error("[Audit]", err.message);
  }
}
