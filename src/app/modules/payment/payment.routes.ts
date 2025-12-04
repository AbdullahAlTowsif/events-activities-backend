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


export const PaymentRoutes = router;
