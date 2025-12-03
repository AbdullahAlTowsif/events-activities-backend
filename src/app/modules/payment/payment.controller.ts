import { Request, Response } from "express";
import httpStatus from "http-status-codes";
import { PaymentService } from "./payment.service";
import Stripe from "stripe";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { stripe } from "../../helper/stripe";
import ApiError from "../../errors/ApiError";

const initPayment = catchAsync(async (req: Request, res: Response) => {

    const eventId = req.params.eventId;
    if (!eventId) {
        throw new ApiError(httpStatus.BAD_REQUEST, "No event id found");
    }
    const userEmail = req.user?.email as string;
    if (!userEmail) {
        return sendResponse(res, {
            statusCode: httpStatus.UNAUTHORIZED,
            success: false,
            message: "Unauthorized: missing user email",
            data: null
        });
    }

    // choose amount: if you want to use event.joiningFee, you can fetch it in service.
    // here we expect client sends amount (or compute server-side)
    const amount = Number(req.body.amount ?? req.body.joiningFee ?? 0);
    if (!amount || amount <= 0) {
        return sendResponse(res, {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: "Invalid amount",
            data: null
        });
    }

    const currency = (req.body.currency as string) ?? "BDT";

    const result = await PaymentService.createPaymentAndSession({
        eventId,
        userEmail,
        amount,
        currency,
    });

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Stripe checkout session created",
        data: {
            checkoutUrl: result.checkoutUrl,
            paymentId: result.payment.id,
            checkoutSessionId: result.checkoutSessionId,
        },
    });
});

// Stripe webhook receiver (raw body must be used in route)
const stripeWebhook = catchAsync(async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"] as string | undefined;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        console.error("Missing STRIPE_WEBHOOK_SECRET");
        return res.status(500).send("Webhook not configured");
    }

    let event: Stripe.Event;
    try {
        // req.body is raw buffer (route must use express.raw({type: 'application/json'}))
        event = stripe.webhooks.constructEvent(req.body as Buffer, sig!, webhookSecret);
    } catch (err: any) {
        console.error("⚠️ Webhook signature verification failed.", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    await PaymentService.handleStripeWebhookEvent(event);

    // respond 200 quickly
    res.status(200).json({ received: true });
});

export const PaymentController = {
    initPayment,
    stripeWebhook,
};
