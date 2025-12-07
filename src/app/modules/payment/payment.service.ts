import Stripe from "stripe";
import { JoinStatus, PaymentStatus } from "@prisma/client";
import { envVars } from "../../config/env";
import { stripe } from "../../helper/stripe";
import prisma from "../../utils/prisma";

type CreatePaymentInput = {
    eventId: string;
    userEmail: string;
    amount: number;
    currency?: string;
};

// const createPaymentAndSession = async (input: CreatePaymentInput) => {
//     const { eventId, userEmail, amount, currency = "BDT" } = input;

//     // Basic validation
//     const event = await prisma.event.findUnique({ where: { id: eventId } });
//     if (!event) throw new Error("Event not found");

//     // create a DB payment record (status: PENDING)
//     const payment = await prisma.payment.create({
//         data: {
//             eventId,
//             userEmail,
//             amount,
//             currency,
//             status: PaymentStatus.PENDING,
//         },
//     });

//     // create Stripe Checkout Session
//     // Stripe expects amount in smallest currency unit (cents). If your currency is BDT
//     // and amount is in BDT, convert according to Stripe requirements. Here we assume "amount"
//     // is the integer amount in the currency's smallest unit if needed. Adjust if necessary.
//     const unitAmount = Math.round(amount * 100); // if your amount is in major units (e.g., 500.50 USD) - adjust accordingly

//     const session = await stripe.checkout.sessions.create({
//         payment_method_types: ["card"],
//         mode: "payment",
//         line_items: [
//             {
//                 price_data: {
//                     currency: currency.toLowerCase(),
//                     product_data: {
//                         name: event.title,
//                         description: event.description ?? undefined,
//                     },
//                     unit_amount: unitAmount,
//                 },
//                 quantity: 1,
//             },
//         ],
//         metadata: {
//             paymentId: payment.id,
//             eventId,
//             userEmail,
//         },
//         // configure your frontend URLs in env
//         success_url: `${envVars.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
//         cancel_url: `${envVars.FRONTEND_URL}/payment-cancel`,
//     });

//     // return DB payment and session url
//     return {
//         payment,
//         checkoutUrl: session.url,
//         checkoutSessionId: session.id,
//     };
// };


const createPaymentAndSession = async (input: CreatePaymentInput) => {
    const { eventId, userEmail, amount, currency = "BDT" } = input;

    const event = await prisma.event.findUnique({
        where: { id: eventId }
    });
    if (!event) throw new Error("Event not found");

    return await prisma.$transaction(async (tx) => {
        // Create payment first
        const payment = await tx.payment.create({
            data: {
                eventId,
                userEmail,
                amount: Math.round(amount),
                currency,
                status: PaymentStatus.PENDING,
            },
        });

        // Check if participant already exists for this event and user
        const existingParticipant = await tx.participant.findFirst({
            where: {
                eventId,
                userEmail,
            },
        });

        let participant;
        if (existingParticipant) {
            // Update existing participant
            participant = await tx.participant.update({
                where: {
                    id: existingParticipant.id
                },
                data: {
                    // Since paymentId is optional in your schema, this should work
                    paymentId: payment.id,
                    status: JoinStatus.PENDING,
                    paid: false,
                },
            });
        } else {
            // Create new participant
            participant = await tx.participant.create({
                data: {
                    eventId,
                    userEmail,
                    paymentId: payment.id,
                    status: JoinStatus.PENDING,
                    paid: false,
                },
            });
        }

        // Create Stripe session
        const unitAmount = Math.round(amount * 100); // Convert to cents

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "payment",
            line_items: [
                {
                    price_data: {
                        currency: currency.toLowerCase(),
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

        // Update payment with session ID
        await tx.payment.update({
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
    });
};


// const handleStripeWebhookEvent = async (event: Stripe.Event) => {
//     switch (event.type) {
//         case "checkout.session.completed": {
//             const session = event.data.object as Stripe.Checkout.Session;
//             const metadata = session.metadata ?? {};
//             const paymentId = metadata.paymentId as string | undefined;
//             const eventId = metadata.eventId as string | undefined;
//             const userEmail = metadata.userEmail as string | undefined;

//             if (!paymentId) {
//                 console.warn("Stripe webhook: missing paymentId in metadata");
//                 return;
//             }

//             // Use transaction to update payment + participant atomically
//             await prisma.$transaction(async (tx) => {
//                 // update payment status and save stripe session as gateway data
//                 await tx.payment.update({
//                     where: { id: paymentId },
//                     data: {
//                         status: PaymentStatus.SUCCESS,
//                         stripePaymentIntentId: session.payment_intent as string | null,
//                         // optional: store full session object in a json/text field if you have one
//                         // paymentGatewayData: session as any
//                     },
//                 });

//                 if (eventId && userEmail) {
//                     // mark participant(s) as paid (updateMany for safety)
//                     await tx.participant.updateMany({
//                         where: {
//                             eventId,
//                             userEmail,
//                         },
//                         data: {
//                             paid: true,
//                             status: undefined as any, // no change; left here to show we only set paid
//                         },
//                     });
//                 } else {
//                     // If metadata does not include participant mapping, you may choose to create a Participant here.
//                     // For now, we only update existing participants.
//                 }
//             });

//             break;
//         }

//         default:
//             console.info(`Unhandled Stripe event type: ${event.type}`);
//     }
// };

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
                    // Update payment status
                    await tx.payment.update({
                        where: { id: paymentId },
                        data: {
                            status: PaymentStatus.SUCCESS,
                            stripePaymentIntentId: session.payment_intent as string | null,
                            stripeSessionId: session.id,
                            updatedAt: new Date(),
                        },
                    });

                    // Update participant status
                    if (participantId) {
                        await tx.participant.update({
                            where: { id: participantId },
                            data: {
                                status: JoinStatus.ACCEPTED,
                                paid: true,
                            },
                        });
                    } else {
                        // Fallback: find by paymentId
                        await tx.participant.updateMany({
                            where: {
                                paymentId: paymentId,
                            },
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
                    await tx.payment.update({
                        where: { id: paymentId },
                        data: {
                            status: PaymentStatus.FAILED,
                            updatedAt: new Date(),
                        },
                    });

                    await tx.participant.updateMany({
                        where: {
                            paymentId: paymentId
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
