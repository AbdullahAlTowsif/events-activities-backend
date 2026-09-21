import { Event, EventStatus, JoinStatus, PaymentStatus, Prisma, UserRole } from "@prisma/client";
import { stripe } from "../../helper/stripe";
import { fileUploader } from "../../helper/fileUploader";
import { publicHostSelect, publicUserSelect } from "../../utils/publicSelects";
import { Request } from "express";
import { IPaginationOptions } from "../../interfaces/pagination";
import { paginationHelper } from "../../helper/paginationHelper";
import { eventSearchableFields } from "./event.constant";
import { JwtPayload } from "jsonwebtoken";
import httpStatus from "http-status-codes";
import ApiError from "../../errors/ApiError";
import prisma from "../../utils/prisma";

const createEvent = async (hostEmail: string, req: Request): Promise<Event> => {
    const isEventExists = await prisma.event.findFirst({
        where: {
            title: req.body.title,
            hostEmail: hostEmail,
            type: req.body.type,
            location: req.body.location
        }
    })

    if (isEventExists) {
        throw new Error("Event Already Exists")
    }
    let images: string[] = [];

    const file = req.file;
    if (file) {
        const uploadToCloudinary = await fileUploader.uploadToCloudinary(file);
        images = [uploadToCloudinary?.secure_url];
        console.log(req.body.images);
    }
    // console.log("file ---->", file);
    // console.log("hostId --->", hostEmail);

    const eventData = {
        title: req.body.title,
        type: req.body.type,
        description: req.body.description,
        location: req.body.location,
        dateTime: new Date(req.body.dateTime),
        hostEmail: hostEmail,
        minParticipants: req.body.minParticipants || null,
        maxParticipants: req.body.maxParticipants || null,
        joiningFee: req.body.joiningFee || 0,
        currency: req.body.currency || "BDT",
        images: images,
    };
    console.log("eventData", eventData);

    const result = await prisma.event.create({
        data: eventData,
    });

    console.log("result --->", result);
    return result;
};


const getAllEvent = async (params: any, options: IPaginationOptions) => {
    const { page, limit, skip } = paginationHelper.calculatePagination(options);
    const { searchTerm, ...filterData } = params;

    const andConditions: Prisma.EventWhereInput[] = [];

    if (params.searchTerm) {
        andConditions.push({
            OR: eventSearchableFields.map(field => ({
                [field]: {
                    contains: params.searchTerm,
                    mode: 'insensitive'
                }
            }))
        })
    };

    if (Object.keys(filterData).length > 0) {
        andConditions.push({
            AND: Object.keys(filterData).map(key => ({
                [key]: {
                    equals: (filterData as any)[key]
                }
            }))
        })
    };

    const whereConditions: Prisma.EventWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

    const result = await prisma.event.findMany({
        where: whereConditions,
        skip,
        take: limit,
        orderBy: options.sortBy && options.sortOrder ? {
            [options.sortBy]: options.sortOrder
        } : {
            createdAt: 'desc'
        },
        select: {
            id: true,
            hostEmail: true,
            title: true,
            type: true,
            description: true,
            location: true,
            dateTime: true,
            minParticipants: true,
            maxParticipants: true,
            joiningFee: true,
            currency: true,
            status: true,
            images: true,
            host: {
                select: publicHostSelect
            },
            _count: {
                select: {
                    payments: true,
                    participants: true,
                }
            },
            createdAt: true,
            updatedAt: true,
        }
    });

    const total = await prisma.event.count({
        where: whereConditions
    });

    return {
        meta: {
            page,
            limit,
            total
        },
        data: result
    };
};


const getEventById = async (id: string): Promise<Event | null> => {
    const result = await prisma.event.findUnique({
        where: {
            id,
        },
        include: {
            host: {
                select: publicHostSelect
            },
            participants: {
                include: {
                    user: {
                        select: publicUserSelect
                    }
                }
            },
            payments: {
                include: {
                    user: {
                        select: publicUserSelect
                    }
                }
            },
        },
    });
    return result;
};


const updateEventById = async (id: string, user: JwtPayload, data: Partial<Event>): Promise<Event> => {
    const event = await prisma.event.findUniqueOrThrow({
        where: {
            id,
        }
    });

    // Only host or admin can update
    const isOwner = event.hostEmail === user.email;
    const isAdmin = user.role === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
        throw new ApiError(httpStatus.FORBIDDEN, "Not allowed to update this event");
    }

    const result = await prisma.event.update({
        where: {
            id
        },
        data
    });

    return result;
};


const deleteEvent = async (eventId: string, user: JwtPayload) => {
    // Check if event exists
    const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: { host: true },
    });

    if (!event) {
        throw new ApiError(httpStatus.NOT_FOUND, "Event not found");
    }

    // Only host or admin can delete
    const isOwner = event.hostEmail === user.email;
    const isAdmin = user.role === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
        throw new ApiError(httpStatus.FORBIDDEN, "Not allowed to delete this event");
    }

    // Transaction - rollback safe
    const result = await prisma.$transaction(async (tx) => {
        // Refuse deletion when money is involved — paid enrollments must be refunded first (M7)
        const paidParticipants = await tx.participant.count({
            where: { eventId, paid: true }
        });

        if (paidParticipants > 0) {
            throw new ApiError(
                httpStatus.BAD_REQUEST,
                "Cannot delete an event with paid participants. Refund or remove them first."
            );
        }

        // Delete participants
        await tx.participant.deleteMany({
            where: { eventId },
        });

        // Delete payments
        await tx.payment.deleteMany({
            where: { eventId },
        });

        // Delete event
        await tx.event.delete({
            where: { id: eventId },
        });
    });

    return result;
}


const joinEvent = async (eventId: string, userEmail: string) => {
    return await prisma.$transaction(async (tx) => {
        // 1. Get event with confirmed participant count
        const event = await tx.event.findUnique({
            where: { id: eventId },
            include: {
                _count: {
                    select: {
                        participants: {
                            where: { status: JoinStatus.ACCEPTED }
                        }
                    }
                }
            }
        });

        if (!event) {
            throw new ApiError(httpStatus.NOT_FOUND, "Event not found");
        }

        // 2. Event must be open
        if (event.status !== EventStatus.OPEN) {
            throw new ApiError(httpStatus.BAD_REQUEST, "Event is not open for joining");
        }

        // 3. Cannot join an event that has already started (H8)
        if (event.dateTime <= new Date()) {
            throw new ApiError(httpStatus.BAD_REQUEST, "Event has already started");
        }

        // 4. Host cannot join own event (H2)
        if (event.hostEmail === userEmail) {
            throw new ApiError(httpStatus.BAD_REQUEST, "You cannot join your own event");
        }

        // 5. Prevent duplicate join
        const alreadyJoined = await tx.participant.findFirst({
            where: {
                userEmail,
                eventId
            }
        });

        if (alreadyJoined) {
            throw new ApiError(httpStatus.BAD_REQUEST, "You have already joined this event");
        }

        // 6. Max participants check — counts only ACCEPTED enrollments (H8)
        if (
            event.maxParticipants &&
            event._count.participants >= event.maxParticipants
        ) {
            throw new ApiError(httpStatus.BAD_REQUEST, "Event is full");
        }

        // 7. Create participant. Paid events stay PENDING until payment completes via
        //    POST /api/payment/init/:eventId; free events are accepted immediately (H3).
        const needsPayment = event.joiningFee > 0;
        const participant = await tx.participant.create({
            data: {
                userEmail,
                eventId,
                status: needsPayment ? JoinStatus.PENDING : JoinStatus.ACCEPTED,
                paid: !needsPayment
            }
        });

        // 8. Transition event to FULL the moment capacity is reached (H8)
        if (event.maxParticipants && event._count.participants + 1 >= event.maxParticipants) {
            await tx.event.update({
                where: { id: eventId },
                data: { status: EventStatus.FULL }
            });
        }

        return { participant, payment: null };
    });
};


const leaveEvent = async (eventId: string, userEmail: string) => {
    return await prisma.$transaction(async (tx) => {
        // 1. Check event exists
        const event = await tx.event.findUnique({
            where: { id: eventId },
        });

        if (!event) {
            throw new ApiError(httpStatus.NOT_FOUND, "Event not found");
        }

        // 2. Check participant exists
        const participant = await tx.participant.findFirst({
            where: {
                eventId,
                userEmail,
            },
        });

        if (!participant) {
            throw new ApiError(
                httpStatus.BAD_REQUEST,
                "You are not a participant of this event"
            );
        }

        // ⚠️ If event already started (DateTime < now), prevent leaving
        if (event.dateTime < new Date()) {
            throw new ApiError(
                httpStatus.BAD_REQUEST,
                "You cannot leave an event that has already started"
            );
        }

        // 3. Refund paid enrollments via Stripe before releasing the seat (H4)
        let refunded = false;

        const payment = participant.paid && participant.paymentId
            ? await tx.payment.findFirst({
                where: {
                    id: participant.paymentId,
                    status: PaymentStatus.SUCCESS,
                },
            })
            : null;

        if (payment?.stripePaymentIntentId) {
            await stripe.refunds.create({
                payment_intent: payment.stripePaymentIntentId,
            });

            await tx.payment.update({
                where: { id: payment.id },
                data: {
                    status: PaymentStatus.REFUNDED,
                    updatedAt: new Date(),
                },
            });

            refunded = true;
        }

        await tx.participant.delete({
            where: { id: participant.id },
        });

        return {
            eventId,
            userEmail,
            refunded,
            needsRefund: participant.paid && !refunded,
        };
    });
};


const getParticipants = async (
    eventId: string,
    requesterEmail: string,
    requesterRole: string
) => {
    // 1. Verify event exists
    const event = await prisma.event.findUnique({
        where: { id: eventId },
    });

    if (!event) {
        throw new ApiError(httpStatus.NOT_FOUND, "Event not found");
    }

    // 2. Authorization: HOST of this event or ADMIN; regular USERS must be ACCEPTED participants (M2)
    const isHostOrAdmin = requesterRole === UserRole.ADMIN || event.hostEmail === requesterEmail;

    if (requesterRole === UserRole.HOST && !isHostOrAdmin) {
        throw new ApiError(
            httpStatus.FORBIDDEN,
            "You are not authorized to view participants"
        );
    }

    if (requesterRole === UserRole.USER) {
        const participation = await prisma.participant.findFirst({
            where: { eventId, userEmail: requesterEmail },
        });

        if (!participation) {
            throw new ApiError(
                httpStatus.FORBIDDEN,
                "You can only view participants of events you have joined"
            );
        }
    }

    // 3. Fetch participants with user details
    const participants = await prisma.participant.findMany({
        where: { eventId },
        include: {
            user: {
                select: {
                    name: true,
                    email: true,
                    profilePhoto: true,
                    contactNumber: true,
                    address: true,
                    gender: true,
                    interests: true
                },
            },
        },
        orderBy: { createdAt: "desc" },
    });

    // 4. Trim contact/address/gender for non-host/non-admin callers (M2)
    if (isHostOrAdmin) {
        return participants;
    }

    return participants.map((p) => ({
        ...p,
        user: p.user
            ? {
                name: p.user.name,
                email: p.user.email,
                profilePhoto: p.user.profilePhoto,
            }
            : p.user,
    }));
};


const createReview = async (
    eventId: string,
    reviewerEmail: string,
    payload: { rating: number; comment?: string }
) => {
    // 1. Fetch event with host
    const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: {
            host: true, // we need hostEmail
        },
    });

    if (!event) {
        throw new ApiError(httpStatus.NOT_FOUND, "Event not found");
    }

    const hostEmail = event.hostEmail;

    // event must already be completed
    if (new Date(event.dateTime) > new Date()) {
        throw new ApiError(
            httpStatus.FORBIDDEN,
            "You can only review an event after it has taken place"
        );
    }

    // 2. Ensure user participated in the event
    const participation = await prisma.participant.findFirst({
        where: {
            eventId,
            userEmail: reviewerEmail,
        },
    });

    if (!participation) {
        throw new ApiError(
            httpStatus.FORBIDDEN,
            "You can only review events you have attended"
        );
    }

    // 3. Prevent duplicate review for same event
    const alreadyReviewed = await prisma.review.findFirst({
        where: {
            userEmail: reviewerEmail,
            hostEmail,
            // If reviewing per event, use relation with event-review table
            // But here host review is per host, so allow multiple events review
        },
    });

    // user can review only one time
    if (alreadyReviewed) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            "You have already reviewed this host"
        );
    }

    // 4. Create review
    const review = await prisma.review.create({
        data: {
            userEmail: reviewerEmail,
            hostEmail,
            rating: payload.rating,
            comment: payload.comment || "💬💬",
        },
    });

    // 5. Return review + event details (as requested)
    return {
        event: {
            id: event.id,
            title: event.title,
            dateTime: event.dateTime,
            location: event.location,
            hostEmail: event.hostEmail,
            joiningFee: event.joiningFee
        },
        review,
    };
};


const getHostByEmail = async (email: string) => {
    const host = await prisma.host.findUnique({
        where: { email },
        select: {
            id: true,
            name: true,
            email: true,
            profilePhoto: true,
            contactNumber: true,
            about: true,
            gender: true,
            interests: true,
            createdAt: true,
            updatedAt: true,
            events: {
                select: {
                    id: true,
                    title: true,
                    dateTime: true,
                    location: true,
                    status: true,
                    images: true,
                },
                orderBy: { createdAt: "desc" }
            },
        }
    });

    if (!host) {
        throw new ApiError(httpStatus.NOT_FOUND, "Host not found");
    }

    return host;
};

const getMyCreatedEvents = async (email: string, role: string) => {
    console.log(email, role);
    // Only HOST can access this API
    if (role !== UserRole.HOST) {
        throw new ApiError(httpStatus.FORBIDDEN, "Only hosts can view their events");
    }

    // Check host exists
    const host = await prisma.host.findUnique({
        where: { email },
    });

    if (!host) {
        throw new ApiError(httpStatus.NOT_FOUND, "Host not found");
    }

    // Get events created by the host
    const events = await prisma.event.findMany({
        where: {
            hostEmail: email,
        },
        orderBy: {
            createdAt: "desc",
        },
    });

    return events;
};


export const EventService = {
    createEvent,
    getAllEvent,
    getEventById,
    updateEventById,
    deleteEvent,
    joinEvent,
    leaveEvent,
    getParticipants,
    createReview,
    getHostByEmail,
    getMyCreatedEvents
};
