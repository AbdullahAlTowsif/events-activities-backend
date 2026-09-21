import { Gender, UserRole } from '@prisma/client';
import { z } from 'zod';

// Validation for generic profile update (C4/H5).
// email / password / role / isDeleted are intentionally excluded from the whitelist.
export const updateUserValidation = z.object({
    name: z
        .string()
        .min(3, 'Name must be at least 3 characters long')
        .max(50, 'Name cannot exceed 50 characters')
        .optional(),

    profilePhoto: z
        .string()
        .optional()
        .or(z.literal('')),

    contactNumber: z
        .string()
        .regex(/^[0-9]{10,15}$/, 'Contact number must be 10-15 digits')
        .optional(),

    about: z
        .string()
        .max(500, 'About cannot exceed 500 characters')
        .optional(),

    address: z
        .string()
        .max(200, 'Address cannot exceed 200 characters')
        .optional()
        .or(z.literal('')),

    gender: z
        .enum([Gender.MALE, Gender.FEMALE], {
            message: 'Gender must be either MALE or FEMALE'
        })
        .optional(),

    interests: z
        .array(z.string().min(1, 'Interest cannot be empty'))
        .min(1, 'At least one interest is required')
        .max(10, 'Cannot have more than 10 interests')
        .optional(),
}).strict();

// Validation for delete/soft delete
export const deleteUserValidation = z.object({
    params: z.object({
        id: z.string(),
    }),
    query: z.object({
        role: z.enum([UserRole.USER, UserRole.HOST, UserRole.ADMIN], {
            message: 'Role must be USER, HOST, or ADMIN'
        }),
    }),
});