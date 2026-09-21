import Stripe from "stripe";
import { JoinStatus, PaymentStatus } from "@prisma/client";
import httpStatus from "http-status-codes";
import { envVars } from "../../config/env";
import { stripe } from "../../helper/stripe";
import ApiError from "../../errors/ApiError";
import prisma from "../../utils/prisma";

type CreatePaymentInput = {
    eventId: string;
    userEmail: string;
};

const createPaymentAndSession = async (input: CreatePaymentInput) => {
    const { eventId, userEmail } = input;

    // Amount/currency are always taken from the event — never trust the client (C2)
    const event = await prisma.event.findUnique({
        where: { id: eventId }
    });
    if (!event) {
        throw new ApiError(httpStatus.NOT_FOUND, "Event not found");
    }

    if (event.joiningFee <= 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, "This event is free; no payment is required");
    }

    // Ensure a participant row exists for this user/event
    let participant = await prisma.participant.findFirst({
        where: { eventId, userEmail }
    });

    if (!participant) {
        participant = await prisma.participant.create({
            data: {
                eventId,
                userEmail,
                status: JoinStatus.PENDING,
                paid: false,
            },
        });
    }

    // Already paid & accepted — do not allow a second charge
    if (participant.paid || participant.status === JoinStatus.ACCEPTED) {
        throw new ApiError(httpStatus.BAD_REQUEST, "You have already paid for this event");
    }

    // Reuse the most recent PENDING payment instead of creating duplicates (H3)
    let payment = await prisma.payment.findFirst({
        where: {
            eventId,
            userEmail,
            status: PaymentStatus.PENDING,
        },
        orderBy: { createdAt: "desc" },
    });

    if (!payment) {
        payment = await prisma.payment.create({
            data: {
                eventId,
                userEmail,
                amount: event.joiningFee,
                currency: event.currency,
                status: PaymentStatus.PENDING,
            },
        });
    }

    // Link the participant to this payment
    if (participant.paymentId !== payment.id) {
        await prisma.participant.update({
            where: { id: participant.id },
            data: {
                paymentId: payment.id,
                status: JoinStatus.PENDING,
                paid: false,
            },
        });
    }

    // Stripe session call stays OUTSIDE any DB transaction (M1)
    const unitAmount = Math.round(event.joiningFee * 100); // Convert to cents

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [
            {
                price_data: {
                    currency: event.currency.toLowerCase(),
                    product_data: {
                        name: event.title,
                        description: event.description || `Registration for ${event.title}`,
                    },
                    unit_amount: unitAmount,
                },
                quantity: 1,
            },
        ],
        metadata: {
            paymentId: payment.id,
            eventId,
            userEmail,
            participantId: participant.id,
        },
        customer_email: userEmail,
        success_url: `${envVars.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&eventId=${eventId}`,
        cancel_url: `${envVars.FRONTEND_URL}/payment-cancel?session_id={CHECKOUT_SESSION_ID}&eventId=${eventId}`,
    });

    await prisma.payment.update({
        where: { id: payment.id },
        data: {
            stripeSessionId: session.id,
            updatedAt: new Date(),
        },
    });

    return {
        payment,
        checkoutUrl: session.url,
        checkoutSessionId: session.id,
    };
};

const handleStripeWebhookEvent = async (event: Stripe.Event) => {
    switch (event.type) {
        case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session;
            const metadata = session.metadata ?? {};
            const paymentId = metadata.paymentId as string | undefined;
            const participantId = metadata.participantId as string | undefined;

            if (!paymentId) {
                console.warn("Stripe webhook: missing paymentId in metadata");
                return;
            }

            try {
                await prisma.$transaction(async (tx) => {
                    // Idempotent: only a PENDING payment moves to SUCCESS (M8)
                    const updated = await tx.payment.updateMany({
                        where: { id: paymentId, status: PaymentStatus.PENDING },
                        data: {
                            status: PaymentStatus.SUCCESS,
                            stripePaymentIntentId: session.payment_intent as string | null,
                            stripeSessionId: session.id,
                            updatedAt: new Date(),
                        },
                    });

                    if (updated.count === 0) {
                        console.log(`Payment ${paymentId} already processed, skipping`);
                        return;
                    }

                    // Mark the participant as paid only if not already
                    if (participantId) {
                        await tx.participant.updateMany({
                            where: { id: participantId, paid: false },
                            data: {
                                status: JoinStatus.ACCEPTED,
                                paid: true,
                            },
                        });
                    } else {
                        await tx.participant.updateMany({
                            where: { paymentId, paid: false },
                            data: {
                                status: JoinStatus.ACCEPTED,
                                paid: true,
                            },
                        });
                    }
                });

                console.log(`Payment ${paymentId} completed successfully`);
            } catch (error) {
                console.error(`Error processing payment ${paymentId}:`, error);
                throw error;
            }
            break;
        }

        case "checkout.session.expired": {
            const session = event.data.object as Stripe.Checkout.Session;
            const metadata = session.metadata ?? {};
            const paymentId = metadata.paymentId as string | undefined;

            if (paymentId) {
                await prisma.$transaction(async (tx) => {
                    // Only downgrade a payment that is still PENDING (M8)
                    await tx.payment.updateMany({
                        where: { id: paymentId, status: PaymentStatus.PENDING },
                        data: {
                            status: PaymentStatus.FAILED,
                            updatedAt: new Date(),
                        },
                    });

                    await tx.participant.updateMany({
                        where: {
                            paymentId,
                            paid: false,
                        },
                        data: {
                            status: JoinStatus.REJECTED,
                            paid: false,
                        },
                    });
                });
            }
            break;
        }

        default:
            console.info(`Unhandled Stripe event type: ${event.type}`);
    }
};

export const PaymentService = {
    createPaymentAndSession,
    handleStripeWebhookEvent,
};