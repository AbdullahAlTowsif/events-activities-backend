/*
  Warnings:

  - You are about to drop the column `hostId` on the `Event` table. All the data in the column will be lost.
  - Added the required column `hostEmail` to the `Event` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_hostId_fkey";

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "hostId",
ADD COLUMN     "hostEmail" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_hostEmail_fkey" FOREIGN KEY ("hostEmail") REFERENCES "hosts"("email") ON DELETE RESTRICT ON UPDATE CASCADE;
