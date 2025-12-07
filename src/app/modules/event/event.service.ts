import { Event, EventStatus, JoinStatus, Prisma, UserRole } from "@prisma/client";
import { fileUploader } from "../../helper/fileUploader";
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
            hostEmail: req.body.hostEmail,
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
            host: true,
            payments: true,
            participants: true,
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
            host: true,
            participants: {
                include: {
                    user: true
                }
            },
            payments: {
                include: {
                    user: true
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
        // 1. Get event with participants count
        const event = await tx.event.findUnique({
            where: { id: eventId },
            include: { participants: true }
        });

        if (!event) {
            throw new ApiError(httpStatus.NOT_FOUND, "Event not found");
        }

        // 2. Event must be open
        if (event.status !== EventStatus.OPEN) {
            throw new ApiError(httpStatus.BAD_REQUEST, "Event is not open for joining");
        }

        // 3. Host cannot join own event
        if (event.hostEmail === undefined) {
            throw new ApiError(httpStatus.BAD_REQUEST, "Host email missing in event");
        }

        const host = await tx.host.findUnique({
            where: { email: event.hostEmail }
        });

        if (host && host.id === userEmail) {
            throw new ApiError(httpStatus.BAD_REQUEST, "You cannot join your own event");
        }

        // 4. Prevent duplicate join
        const alreadyJoined = await tx.participant.findFirst({
            where: {
                userEmail,
                eventId
            }
        });

        if (alreadyJoined) {
            throw new ApiError(httpStatus.BAD_REQUEST, "You have already joined this event");
        }

        // 5. Max participants check
        if (
            event.maxParticipants &&
            event.participants.length >= event.maxParticipants
        ) {
            throw new ApiError(httpStatus.BAD_REQUEST, "Event is full");
        }

        // 6. Create participant
        const participant = await tx.participant.create({
            data: {
                userEmail,
                eventId,
                status: JoinStatus.ACCEPTED,
                paid: event.joiningFee === 0
            }
        });

        let payment = null;

        // 7. Create payment if fee exists
        if (event.joiningFee > 0) {
            payment = await tx.payment.create({
                data: {
                    userEmail,
                    eventId,
                    amount: event.joiningFee,
                    currency: event.currency,
                    status: "PENDING"
                }
            });
        }

        return { participant, payment };
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

        // ⚠️ OPTIONAL RULE:
        // If event already started (DateTime < now), prevent leaving
        if (event.dateTime < new Date()) {
            throw new ApiError(
                httpStatus.BAD_REQUEST,
                "You cannot leave an event that has already started"
            );
        }

        // 3. Delete participant record
        await tx.participant.delete({
            where: { id: participant.id },
        });

        // ⚠️ If paid = true, later implement refund
        // For now return info
        return {
            eventId,
            userEmail,
            refunded: participant.paid ? true : false,
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

    // 2. Authorization: must be HOST of event OR ADMIN
    if (requesterRole !== UserRole.ADMIN && event.hostEmail !== requesterEmail) {
        throw new ApiError(
            httpStatus.FORBIDDEN,
            "You are not authorized to view participants"
        );
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

    return participants;
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
        include: {
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
    getHostByEmail
};
