import { Prisma } from "@prisma/client";

// Shared public projections — NEVER include `password` in these (C3/H9)

export const publicUserSelect = Prisma.validator<Prisma.UserSelect>()({
    id: true,
    name: true,
    email: true,
    profilePhoto: true,
    contactNumber: true,
});

export const publicHostSelect = Prisma.validator<Prisma.HostSelect>()({
    id: true,
    name: true,
    email: true,
    profilePhoto: true,
    contactNumber: true,
});

export const paymentBriefSelect = Prisma.validator<Prisma.PaymentSelect>()({
    id: true,
    userEmail: true,
    eventId: true,
    amount: true,
    currency: true,
    status: true,
    createdAt: true,
});