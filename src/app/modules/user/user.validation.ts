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


export const userValidation = {
    createAdmin,
    createHost,
    createUser
};
