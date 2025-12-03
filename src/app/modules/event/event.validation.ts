import { z } from "zod";

const createEventValidationSchema = z.object({
    title: z.string().min(4, "Event title should be min 4 characters long"),
    type: z.string("Event type is required"),
    description: z.string("Event description is required").min(20, "Event description should be min 30 characters long"),
    location: z.string("Event location is required"),
    dateTime: z.string("Event datetime is required"),
    minParticipants: z.number().optional(),
    maxParticipants: z.number().optional(),
    joiningFee: z.number().optional(),
    currency: z.string().optional(),
    images: z.array(z.string()).optional(),
});

const updateEventValidationSchema = z.object({
    minParticipants: z.number().optional(),
    maxParticipants: z.number().optional(),
    joiningFee: z.number().optional(),
    currency: z.string().optional(),
    images: z.array(z.string()).optional(),
});


export const eventValidation = {
    createEventValidationSchema,
    updateEventValidationSchema
};