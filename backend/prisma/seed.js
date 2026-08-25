import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminUsername = process.env.SEED_ADMIN_USERNAME || "admin";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const adminName = process.env.SEED_ADMIN_NAME || "System Administrator";

  if (!adminPassword || adminPassword.length < 10) {
    throw new Error(
      "SEED_ADMIN_PASSWORD is required and must be at least 10 characters."
    );
  }

  // إنشاء/تحديث الفرع الرئيسي
  const branch = await prisma.branch.upsert({
    where: {
      code: "MAIN",
    },
    update: {
      isActive: true,
    },
    create: {
      name: "الفرع الرئيسي",
      code: "MAIN",
      city: "Main",
      isActive: true,
    },
  });

  // تشفير كلمة المرور بنفس طريقة النظام
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  // إنشاء أول Super Admin أو تحديثه لو موجود
  const admin = await prisma.user.upsert({
    where: {
      username: adminUsername,
    },
    update: {
      name: adminName,
      passwordHash,
      role: "SUPER_ADMIN",
      isActive: true,
      branchId: branch.id,
      maxDiscountPct: 100,
    },
    create: {
      name: adminName,
      username: adminUsername,
      passwordHash,
      role: "SUPER_ADMIN",
      isActive: true,
      branchId: branch.id,
      maxDiscountPct: 100,
    },
  });

  console.log("=================================");
  console.log("ERP POS initial setup completed");
  console.log(`Branch: ${branch.name} (${branch.code})`);
  console.log(`Admin username: ${admin.username}`);
  console.log("Admin password: [hidden]");
  console.log("=================================");
}

main()
  .catch((error) => {
    console.error("Seed failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });