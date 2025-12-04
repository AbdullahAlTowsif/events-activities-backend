import { HostApplicationStatus, UserRole } from '@prisma/client';
import { prisma } from '../../utils/prisma';

const applyToBeHost = async (userEmail: string, data: {
    reason?: string;
    contactNumber?: string;
    address?: string;
}) => {
    const user = await prisma.user.findUnique({
        where: { email: userEmail }
    });

    if (!user) {
        throw new Error('User not found');
    }

    if (user.role === UserRole.HOST || user.role === UserRole.ADMIN) {
        throw new Error('User is already a host or admin');
    }

    // Check if user already has a pending application
    const existingApplication = await prisma.hostApplication.findFirst({
        where: {
            userEmail,
            status: HostApplicationStatus.PENDING
        }
    });

    if (existingApplication) {
        throw new Error('You already have a pending host application');
    }

    const application = await prisma.hostApplication.create({
        data: {
            userEmail,
            email: user.email,
            name: user.name,
            contactNumber: data.contactNumber || user.contactNumber,
            address: data.address || user.address || '',
            gender: user.gender,
            interests: user.interests,
            reason: data.reason || "",
            personEmail: userEmail
        }
    });

    return application;
};

const getMyApplications = async (userEmail: string) => {
    const applications = await prisma.hostApplication.findMany({
        where: {
            userEmail
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    return applications;
};

const getAllApplications = async () => {
    const applications = await prisma.hostApplication.findMany({
        where: {
            status: HostApplicationStatus.PENDING
        },
        include: {
            user: {
                select: {
                    name: true,
                    email: true,
                    profilePhoto: true,
                    gender: true,
                    createdAt: true
                }
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    return applications;
};

const updateApplicationStatus = async (
    applicationId: string, 
    adminEmail: string, 
    data: {
        status: HostApplicationStatus;
        feedback?: string;
    }
) => {
    return await prisma.$transaction(async (tx) => {
        const application = await tx.hostApplication.findUnique({
            where: { id: applicationId },
            include: { user: true }
        });

        if (!application) {
            throw new Error('Application not found');
        }

        if (application.status !== HostApplicationStatus.PENDING) {
            throw new Error('Application has already been processed');
        }

        // Update application status
        const updatedApplication = await tx.hostApplication.update({
            where: { id: applicationId },
            data: {
                status: data.status,
                reviewedBy: adminEmail,
                reviewedAt: new Date(),
                feedback: data.feedback || ""
            }
        });

        if (data.status === HostApplicationStatus.APPROVED) {
            // Create host profile
            await tx.host.create({
                data: {
                    email: application.email,
                    name: application.name,
                    password: application.user.password, // Use existing password
                    role: UserRole.HOST,
                    profilePhoto: application.user.profilePhoto || "",
                    contactNumber: application.contactNumber,
                    address: application.address,
                    gender: application.gender,
                    interests: application.interests,
                }
            });

            // Update user role
            await tx.user.update({
                where: { id: application.userEmail },
                data: {
                    role: UserRole.HOST
                }
            });

            // Update person role
            await tx.person.update({
                where: { email: application.email },
                data: {
                    role: UserRole.HOST
                }
            });
        }

        return updatedApplication;
    });
};

export const HostApplicationService = {
    applyToBeHost,
    getMyApplications,
    getAllApplications,
    updateApplicationStatus
};
