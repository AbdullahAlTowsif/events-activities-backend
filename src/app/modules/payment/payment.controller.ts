import { Request, Response } from "express";
import httpStatus from "http-status-codes";
import { PaymentService } from "./payment.service";
import Stripe from "stripe";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { stripe } from "../../helper/stripe";
import ApiError from "../../errors/ApiError";
import prisma from "../../utils/prisma";
import { JoinStatus, PaymentStatus } from "@prisma/client";

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
// const stripeWebhook = catchAsync(async (req: Request, res: Response) => {
//     const sig = req.headers["stripe-signature"] as string | undefined;
//     const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
//     if (!webhookSecret) {
//         console.error("Missing STRIPE_WEBHOOK_SECRET");
//         return res.status(500).send("Webhook not configured");
//     }

//     let event: Stripe.Event;
//     try {
//         // req.body is raw buffer (route must use express.raw({type: 'application/json'}))
//         event = stripe.webhooks.constructEvent(req.body as Buffer, sig!, webhookSecret);
//     } catch (err: any) {
//         console.error("⚠️ Webhook signature verification failed.", err.message);
//         return res.status(400).send(`Webhook Error: ${err.message}`);
//     }

//     await PaymentService.handleStripeWebhookEvent(event);

//     // respond 200 quickly
//     res.status(200).json({ received: true });
// });

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

// const verifyPayment = catchAsync(async (req: Request, res: Response) => {
//     const sessionId = req.query.session_id as string;

//     if (!sessionId) {
//         throw new ApiError(httpStatus.BAD_REQUEST, "Session ID required");
//     }

//     console.log('Looking for payment with sessionId:', sessionId);

//     // First try to find by stripeSessionId
//     const payment = await prisma.payment.findFirst({
//         where: {
//             stripeSessionId: sessionId,
//         },
//         include: {
//             participants: {
//                 take: 1, // Get first participant
//             },
//         },
//     });

//     if (!payment) {
//         console.log('Payment not found by stripeSessionId, trying stripePaymentIntentId');
//         // Try by stripePaymentIntentId
//         const paymentByIntent = await prisma.payment.findFirst({
//             where: {
//                 stripePaymentIntentId: sessionId,
//             },
//             include: {
//                 participants: {
//                     take: 1,
//                 },
//             },
//         });

//         if (!paymentByIntent) {
//             console.log('Payment not found by any ID');
//             return sendResponse(res, {
//                 statusCode: httpStatus.NOT_FOUND,
//                 success: false,
//                 message: "Payment not found",
//                 data: null
//             });
//         }

//         sendResponse(res, {
//             statusCode: httpStatus.OK,
//             success: true,
//             message: "Payment status retrieved",
//             data: {
//                 status: paymentByIntent.status,
//                 participantStatus: paymentByIntent.participants[0]?.status,
//                 paid: paymentByIntent.participants[0]?.paid,
//                 paymentId: paymentByIntent.id,
//                 stripeSessionId: paymentByIntent.stripeSessionId,
//                 stripePaymentIntentId: paymentByIntent.stripePaymentIntentId
//             }
//         });
//         return;
//     }

//     sendResponse(res, {
//         statusCode: httpStatus.OK,
//         success: true,
//         message: "Payment status retrieved",
//         data: {
//             status: payment.status,
//             participantStatus: payment.participants[0]?.status,
//             paid: payment.participants[0]?.paid,
//             paymentId: payment.id,
//             stripeSessionId: payment.stripeSessionId,
//             stripePaymentIntentId: payment.stripePaymentIntentId
//         }
//     });
// });

const verifyPayment = catchAsync(async (req: Request, res: Response) => {
    const sessionId = req.query.session_id as string;

    if (!sessionId) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Session ID required");
    }

    console.log('Looking for payment with sessionId:', sessionId);

    // First try to find by stripeSessionId
    const payment = await prisma.payment.findFirst({
        where: {
            stripeSessionId: sessionId,
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

const manualWebhook = catchAsync(async (req: Request, res: Response) => {
    const sessionId = req.query.session_id as string;

    if (!sessionId) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Session ID required");
    }

    console.log('Manual webhook trigger for session:', sessionId);

    try {
        // Retrieve session from Stripe
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        // Check if payment was successful
        if (session.payment_status === 'paid') {
            // Create a proper Stripe Event object
            const mockEvent: Stripe.Event = {
                id: 'evt_' + Date.now(),
                object: 'event',
                api_version: '2023-10-16', // Use your Stripe API version
                created: Math.floor(Date.now() / 1000),
                livemode: false, // Test mode
                pending_webhooks: 0,
                request: {
                    id: 'req_' + Date.now(),
                    idempotency_key: 'manual_' + Date.now()
                },
                type: 'checkout.session.completed',
                data: {
                    object: session
                }
            } as Stripe.Event;

            // Process the webhook
            await PaymentService.handleStripeWebhookEvent(mockEvent);

            sendResponse(res, {
                statusCode: httpStatus.OK,
                success: true,
                message: "Webhook processed manually",
                data: {
                    sessionId: session.id,
                    paymentStatus: session.payment_status
                }
            });
        } else {
            throw new ApiError(httpStatus.BAD_REQUEST, `Payment status is ${session.payment_status}, not 'paid'`);
        }

    } catch (error: any) {
        console.error('Manual webhook error:', error);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message || 'Failed to process webhook');
    }
});

export const PaymentController = {
    initPayment,
    stripeWebhook,
    verifyPayment,
    manualWebhook
};
