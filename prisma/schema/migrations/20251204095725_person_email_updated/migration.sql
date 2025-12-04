/*
  Warnings:

  - You are about to drop the column `personId` on the `host_applications` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "host_applications" DROP CONSTRAINT "host_applications_personId_fkey";

-- AlterTable
ALTER TABLE "host_applications" DROP COLUMN "personId",
ADD COLUMN     "personEmail" TEXT;

-- AddForeignKey
ALTER TABLE "host_applications" ADD CONSTRAINT "host_applications_personEmail_fkey" FOREIGN KEY ("personEmail") REFERENCES "persons"("email") ON DELETE SET NULL ON UPDATE CASCADE;
