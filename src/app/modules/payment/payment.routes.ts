import express from "express";
import { PaymentController } from "./payment.controller";
import auth from "../../middlewares/auth"; // adjust path if needed
import { UserRole } from "@prisma/client";

const router = express.Router();

// Create payment / start Stripe checkout
// body: { amount: number, currency?: string } OR server can compute amount from event.joiningFee
router.post(
  "/init/:eventId",
  auth(UserRole.USER, UserRole.HOST, UserRole.ADMIN), // only authenticated users
  PaymentController.initPayment
);

// Stripe webhook (must be raw body)
// router.post(
//   "/stripe/webhook",
//   express.raw({ type: "application/json" }),
//   PaymentController.stripeWebhook
// );

export const PaymentRoutes = router;
