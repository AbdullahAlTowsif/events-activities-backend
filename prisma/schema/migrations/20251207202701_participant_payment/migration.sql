-- AlterTable
ALTER TABLE "Participant" ADD COLUMN     "paymentId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "stripeSessionId" TEXT;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
