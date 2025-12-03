import { Event } from "@prisma/client";
import { fileUploader } from "../../helper/fileUploader";
import { prisma } from "../../utils/prisma";
import { Request } from "express";

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
    console.log("file ---->", file);
    console.log("hostId --->", hostEmail);

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

export const EventService = { createEvent };
