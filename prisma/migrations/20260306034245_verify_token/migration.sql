-- AlterTable
ALTER TABLE "ContactEmail" ADD COLUMN "verification_token" TEXT;

-- AlterTable
ALTER TABLE "ContactPhone" ADD COLUMN "verification_token" TEXT;
