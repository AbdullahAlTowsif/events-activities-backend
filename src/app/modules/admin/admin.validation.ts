import { Gender, UserRole } from '@prisma/client';
import { z } from 'zod';

// Validation for generic user update
export const updateUserValidation = z.object({
    params: z.object({
        id: z.string(),
    }),
    query: z.object({
        role: z.enum([UserRole.USER, UserRole.HOST, UserRole.ADMIN], {
            message: 'Role must be USER, HOST, or ADMIN'
        }),
    }),
    body: z.object({
        name: z
            .string()
            .min(3, 'Name must be at least 3 characters long')
            .max(50, 'Name cannot exceed 50 characters')
            .optional(),

        email: z
            .string()
            .email('Invalid email address')
            .optional(),

        password: z
            .string()
            .optional(),

        profilePhoto: z
            .string()
            .optional()
            .or(z.literal('')),

        contactNumber: z
            .string()
            .regex(/^[0-9]{10,15}$/, 'Contact number must be 10-15 digits')
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
    }),
});

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
