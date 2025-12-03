import { Event, Prisma, UserRole } from "@prisma/client";
import { fileUploader } from "../../helper/fileUploader";
import { prisma } from "../../utils/prisma";
import { Request } from "express";
import { IPaginationOptions } from "../../interfaces/pagination";
import { paginationHelper } from "../../helper/paginationHelper";
import { eventSearchableFields } from "./event.constant";
import { JwtPayload } from "jsonwebtoken";
import httpStatus from "http-status-codes";
import ApiError from "../../errors/ApiError";

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


const updateEventById = async (id: string, data: Partial<Event>): Promise<Event> => {
    await prisma.event.findUniqueOrThrow({
        where: {
            id,
        }
    });

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



export const EventService = {
    createEvent,
    getAllEvent,
    getEventById,
    updateEventById,
    deleteEvent
};
