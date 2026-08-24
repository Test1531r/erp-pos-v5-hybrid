-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "commercialRegister" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "logo" TEXT,
ADD COLUMN     "taxNumber" TEXT;

-- CreateIndex
CREATE INDEX "branches_name_idx" ON "branches"("name");

-- CreateIndex
CREATE INDEX "branches_city_idx" ON "branches"("city");
