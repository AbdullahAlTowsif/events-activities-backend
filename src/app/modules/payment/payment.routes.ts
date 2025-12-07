import express from "express";
import { PaymentController } from "./payment.controller";
import auth from "../../middlewares/auth";
import { UserRole } from "@prisma/client";

const router = express.Router();

router.post(
  "/init/:eventId",
  auth(UserRole.USER, UserRole.HOST, UserRole.ADMIN), // only authenticated users
  PaymentController.initPayment
);

router.get(
  "/verify",
  auth(UserRole.USER, UserRole.HOST, UserRole.ADMIN), // Optional: you might want to make this public
  PaymentController.verifyPayment
);


// In payment.routes.ts
router.post(
  "/manual-webhook",
  PaymentController.manualWebhook
);

export const PaymentRoutes = router;
