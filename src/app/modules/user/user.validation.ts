import { Gender, UserRole } from "@prisma/client";
import { z } from "zod";

const createAdmin = z.object({
    password: z.string({
        error: "Password is required",
    }),
    admin: z.object({
        name: z.string({
            error: "Name is required!",
        }),
        email: z.string({
            error: "Email is required!",
        }),
        role: z.enum([UserRole.ADMIN, UserRole.HOST, UserRole.USER]).default(UserRole.ADMIN),
        profilePhoto: z.string().optional(),
        contactNumber: z.string({
            error: "Contact Number is required!",
        }),
        about: z.string().optional(),
        address: z.string().optional(),
        gender: z.enum([Gender.MALE, Gender.FEMALE]),
        interests: z.array(z.string("Interest is required")),
    })
});

const createHost = z.object({
    password: z.string({
        error: "Password is required",
    }),
    host: z.object({
        name: z.string({
            error: "Name is required!",
        }),
        email: z.string({
            error: "Email is required!",
        }),
        role: z.enum([UserRole.ADMIN, UserRole.HOST, UserRole.USER]).default(UserRole.HOST),
        profilePhoto: z.string().optional(),
        contactNumber: z.string({
            error: "Contact Number is required!",
        }),
        about: z.string().optional(),
        address: z.string().optional(),
        gender: z.enum([Gender.MALE, Gender.FEMALE]),
        interests: z.array(z.string("Interest is required")),
    })
});

const createUser = z.object({
    password: z.string({
        error: "Password is required",
    }),
    user: z.object({
        name: z.string({
            error: "Name is required!",
        }),
        email: z.string({
            error: "Email is required!",
        }),
        role: z.enum([UserRole.ADMIN, UserRole.HOST, UserRole.USER]).default(UserRole.USER),
        profilePhoto: z.string().optional(),
        contactNumber: z.string({
            error: "Contact Number is required!",
        }),
        about: z.string().optional(),
        address: z.string().optional(),
        gender: z.enum([Gender.MALE, Gender.FEMALE]),
        interests: z.array(z.string("Interest is required")),
    })
});

// Whitelist for self-service profile updates (C4/H5).
// role / email / password / isDeleted are intentionally excluded.
const updateMyProfileValidationSchema = z.object({
    name: z.string().min(3, "Name must be at least 3 characters long").max(50, "Name cannot exceed 50 characters").optional(),
    profilePhoto: z.string().optional(),
    contactNumber: z.string().optional(),
    about: z.string().max(500, "About cannot exceed 500 characters").optional(),
    address: z.string().max(200, "Address cannot exceed 200 characters").optional(),
    gender: z.enum([Gender.MALE, Gender.FEMALE]).optional(),
    interests: z.array(z.string().min(1, "Interest cannot be empty")).max(10, "Cannot have more than 10 interests").optional(),
}).strict();


export const userValidation = {
    createAdmin,
    createHost,
    createUser,
    updateMyProfileValidationSchema
};
