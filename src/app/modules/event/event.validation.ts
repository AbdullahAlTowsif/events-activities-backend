import { z } from "zod";

export const createEventValidationSchema = z.object({
    title: z.string({
        error: "Event title is required",
    }).min(4, "Event title should be min 4 characters long"),
    type: z.string({
        error: "Event type is required",
    }),
    description: z.string({
        error: "Event description is required",
    }).min(20, "Event description should be min 20 characters long"),
    location: z.string({
        error: "Event location is required",
    }),
    dateTime: z.string({
        error: "Event datetime is required",
    }).refine((value) => !isNaN(Date.parse(value)), {
        message: "Event datetime must be a valid date string",
    }).refine((value) => new Date(value).getTime() > Date.now(), {
        message: "Event datetime must be in the future",
    }),
    minParticipants: z.number().optional(),
    maxParticipants: z.number().optional(),
    joiningFee: z.number().nonnegative("Joining fee cannot be negative").optional(),
    currency: z.string().optional(),
    images: z.array(z.string()).optional(),
});

export const updateEventValidationSchema = z.object({
    title: z.string().min(4, "Event title should be min 4 characters long").optional(),
    type: z.string().optional(),
    description: z.string().min(20, "Event description should be min 20 characters long").optional(),
    location: z.string().optional(),
    dateTime: z.string()
        .optional()
        .refine((value) => value === undefined || !isNaN(Date.parse(value)), {
            message: "Event datetime must be a valid date string",
        })
        .refine((value) => value === undefined || new Date(value).getTime() > Date.now(), {
            message: "Event datetime must be in the future",
        }),
    minParticipants: z.number().optional(),
    maxParticipants: z.number().optional(),
    joiningFee: z.number().nonnegative("Joining fee cannot be negative").optional(),
    currency: z.string().optional(),
    images: z.array(z.string()).optional(),
}).strict();

export const createReviewValidationSchema = z.object({
    rating: z.number().int("Rating must be an integer").min(1).max(5),
    comment: z.string().max(500, "Comment cannot exceed 500 characters").optional(),
}).strict();

export const eventValidation = {
    createEventValidationSchema,
    updateEventValidationSchema,
    createReviewValidationSchema
};