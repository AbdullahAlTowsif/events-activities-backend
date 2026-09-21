import { Request, Response } from "express";
import httpStatus from "http-status-codes";
import { PaymentService } from "./payment.service";
import Stripe from "stripe";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { stripe } from "../../helper/stripe";
import ApiError from "../../errors/ApiError";
import prisma from "../../utils/prisma";
import { JoinStatus, PaymentStatus, UserRole } from "@prisma/client";

const initPayment = catchAsync(async (req: Request, res: Response) => {

    const eventId = req.params.eventId;
    if (!eventId) {
        throw new ApiError(httpStatus.BAD_REQUEST, "No event id found");
    }
    const userEmail = req.user?.email as string;
    if (!userEmail) {
        throw new ApiError(httpStatus.UNAUTHORIZED, "Unauthorized: missing user email");
    }

    // Amount and currency are derived server-side from the event (C2) — req.body is ignored
    const result = await PaymentService.createPaymentAndSession({
        eventId,
        userEmail,
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


const stripeWebhook = catchAsync(async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"] as string | undefined;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        console.error("Missing STRIPE_WEBHOOK_SECRET");
        return res.status(500).send("Webhook not configured");
    }

    if (!sig) {
        return res.status(400).send("Missing stripe-signature header");
    }

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
        console.error("⚠️ Webhook signature verification failed.", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        await PaymentService.handleStripeWebhookEvent(event);
        res.status(200).json({ received: true });
    } catch (error) {
        console.error("Error processing webhook:", error);
        // Stripe will retry if we return non-2xx
        res.status(500).json({ error: "Failed to process webhook" });
    }
});


const verifyPayment = catchAsync(async (req: Request & { user?: any }, res: Response) => {
    const sessionId = req.query.session_id as string;
    const userEmail = req.user?.email as string;
    const isAdmin = req.user?.role === UserRole.ADMIN;

    if (!sessionId) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Session ID required");
    }

    if (!userEmail) {
        throw new ApiError(httpStatus.UNAUTHORIZED, "User not authenticated");
    }

    // Non-admins may only inspect their own payments (C6)
    const ownedFilter = isAdmin ? {} : { userEmail };

    console.log('Looking for payment with sessionId:', sessionId);

    // First try to find by stripeSessionId
    const payment = await prisma.payment.findFirst({
        where: {
            stripeSessionId: sessionId,
            ...ownedFilter,
        },
        include: {
            participants: {
                take: 1,
            },
        },
    });

    // If payment is still PENDING, check Stripe directly
    if (payment && payment.status === 'PENDING') {
        try {
            console.log('Payment is PENDING, checking Stripe directly...');
            const session = await stripe.checkout.sessions.retrieve(sessionId);

            if (session.payment_status === 'paid') {
                console.log('Stripe shows payment is paid, updating database...');

                // Update payment in database
                await prisma.$transaction(async (tx) => {
                    await tx.payment.update({
                        where: { id: payment.id },
                        data: {
                            status: PaymentStatus.SUCCESS,
                            stripePaymentIntentId: session.payment_intent as string | null,
                            updatedAt: new Date(),
                        },
                    });

                    await tx.participant.updateMany({
                        where: {
                            paymentId: payment.id,
                        },
                        data: {
                            status: JoinStatus.ACCEPTED,
                            paid: true,
                        },
                    });
                });

                // Fetch updated payment
                const updatedPayment = await prisma.payment.findFirst({
                    where: { id: payment.id },
                    include: {
                        participants: {
                            take: 1,
                        },
                    },
                });

                if (updatedPayment) {
                    return sendResponse(res, {
                        statusCode: httpStatus.OK,
                        success: true,
                        message: "Payment status retrieved and updated",
                        data: {
                            status: updatedPayment.status,
                            participantStatus: updatedPayment.participants[0]?.status,
                            paid: updatedPayment.participants[0]?.paid,
                            paymentId: updatedPayment.id,
                            stripeSessionId: updatedPayment.stripeSessionId,
                            stripePaymentIntentId: updatedPayment.stripePaymentIntentId,
                            note: "Status updated from Stripe check"
                        }
                    });
                }
            }
        } catch (stripeError) {
            console.error('Error checking Stripe:', stripeError);
            // Continue with existing payment data
        }
    }

    // Return existing payment data
    if (payment) {
        return sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "Payment status retrieved",
            data: {
                status: payment.status,
                participantStatus: payment.participants[0]?.status,
                paid: payment.participants[0]?.paid,
                paymentId: payment.id,
                stripeSessionId: payment.stripeSessionId,
                stripePaymentIntentId: payment.stripePaymentIntentId
            }
        });
    }

    // Payment not found in database
    console.log('Payment not found by stripeSessionId, trying stripePaymentIntentId');
    const paymentByIntent = await prisma.payment.findFirst({
        where: {
            stripePaymentIntentId: sessionId,
            ...ownedFilter,
        },
        include: {
            participants: {
                take: 1,
            },
        },
    });

    if (!paymentByIntent) {
        console.log('Payment not found by any ID');
        return sendResponse(res, {
            statusCode: httpStatus.NOT_FOUND,
            success: false,
            message: "Payment not found",
            data: null
        });
    }

    return sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Payment status retrieved",
        data: {
            status: paymentByIntent.status,
            participantStatus: paymentByIntent.participants[0]?.status,
            paid: paymentByIntent.participants[0]?.paid,
            paymentId: paymentByIntent.id,
            stripeSessionId: paymentByIntent.stripeSessionId,
            stripePaymentIntentId: paymentByIntent.stripePaymentIntentId
        }
    });
});

export const PaymentController = {
    initPayment,
    stripeWebhook,
    verifyPayment,
};