import { Admin, Host, Person, Prisma, User, UserRole } from "@prisma/client";
import { adminSearchAbleFields } from "./admin.constant";
import { paginationHelper } from "../../helper/paginationHelper";
import { IPaginationOptions } from "../../interfaces/pagination";
import { IAdminFilterRequest } from "./admin.interface";
import prisma from "../../utils/prisma";

const getAllAdmin = async (params: IAdminFilterRequest, options: IPaginationOptions) => {
    const { page, limit, skip } = paginationHelper.calculatePagination(options);
    const { searchTerm, ...filterData } = params;

    const andConditions: Prisma.AdminWhereInput[] = [];

    // Search conditions
    if (params.searchTerm) {
        andConditions.push({
            OR: adminSearchAbleFields.map(field => ({
                [field]: {
                    contains: params.searchTerm,
                    mode: 'insensitive'
                }
            }))
        });
    }

    // Filter conditions
    if (Object.keys(filterData).length > 0) {
        andConditions.push({
            AND: Object.keys(filterData).map(key => ({
                [key]: {
                    equals: (filterData as any)[key]
                }
            }))
        });
    }

    // Exclude deleted admins
    andConditions.push({
        isDeleted: false
    });

    const whereConditions: Prisma.AdminWhereInput = { AND: andConditions };

    const result = await prisma.admin.findMany({
        where: whereConditions,
        skip,
        take: limit,
        orderBy: options.sortBy && options.sortOrder ? {
            [options.sortBy]: options.sortOrder
        } : {
            createdAt: 'desc'
        }
    });

    const total = await prisma.admin.count({
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

const getPersonById = async (id: string): Promise<any | null> => {
    const person = await prisma.person.findUnique({
        where: {
            id,
            isDeleted: false
        },
        include: {
            user: true,
            host: true,
            admin: true
        }
    });

    if (!person) {
        return null;
    }

    // Determine which profile data to include based on role
    let profileData = null;

    switch (person.role) {
        case 'USER':
            profileData = person.user;
            break;
        case 'HOST':
            profileData = person.host;
            break;
        case 'ADMIN':
            profileData = person.admin;
            break;
    }

    return {
        profile: profileData
    };
};

const updatePersonIntoDB = async (
    userId: string,
    data: Partial<User & Host & Admin>
): Promise<User | Host | Admin> => {

    // First, get the person to know their role
    const person = await prisma.person.findUnique({
        where: {
            id: userId,
            isDeleted: false
        }
    });

    if (!person) {
        throw new Error('Person not found');
    }

    const role = person.role as UserRole; // Get role from person

    let result;

    // Update based on person's role
    switch (role) {
        case UserRole.USER:
            // Check if user exists
            await prisma.user.findUniqueOrThrow({
                where: { email: person.email }
            });

            result = await prisma.user.update({
                where: { email: person.email },
                data: data as Partial<User>
            });
            break;

        case UserRole.HOST:
            // Check if host exists
            await prisma.host.findUniqueOrThrow({
                where: { email: person.email }
            });

            result = await prisma.host.update({
                where: { email: person.email },
                data: data as Partial<Host>
            });
            break;

        case UserRole.ADMIN:
            // Check if admin exists
            await prisma.admin.findUniqueOrThrow({
                where: { email: person.email }
            });

            result = await prisma.admin.update({
                where: { email: person.email },
                data: data as Partial<Admin>
            });
            break;

        default:
            throw new Error('Invalid role');
    }

    // Also update person if email or password changed
    if (data.email || data.password) {
        const updateData: any = {};
        if (data.email) updateData.email = data.email;
        if (data.password) updateData.password = data.password;

        await prisma.person.update({
            where: { id: userId },
            data: updateData
        });
    }

    return result;
};

const deletePersonFromDB = async (
    userId: string,
    role: UserRole
): Promise<User | Host | Admin | null> => {

    // First, get the person
    const person = await prisma.person.findUnique({
        where: { id: userId }
    });

    if (!person) {
        throw new Error('Person not found');
    }

    // Verify the person has the correct role
    if (person.role !== role) {
        throw new Error(`Person role (${person.role}) doesn't match requested role (${role})`);
    }

    const result = await prisma.$transaction(async (tx) => {
        let deletedProfile;

        // Delete based on role
        switch (role) {
            case UserRole.USER:
                await tx.user.findUniqueOrThrow({
                    where: { email: person.email }
                });

                deletedProfile = await tx.user.delete({
                    where: { email: person.email }
                });
                break;

            case UserRole.HOST:
                await tx.host.findUniqueOrThrow({
                    where: { email: person.email }
                });

                deletedProfile = await tx.host.delete({
                    where: { email: person.email }
                });
                break;

            case UserRole.ADMIN:
                await tx.admin.findUniqueOrThrow({
                    where: { email: person.email }
                });

                deletedProfile = await tx.admin.delete({
                    where: { email: person.email }
                });
                break;

            default:
                throw new Error('Invalid role');
        }

        // Also delete person record
        await tx.person.delete({
            where: { id: userId }
        });

        return deletedProfile;
    });

    return result;
};


// Updated service - no need for role parameter
const softDeletePersonFromDB = async (
    userId: string
): Promise<User | Host | Admin | null> => {

    // First, get the person
    const person = await prisma.person.findUnique({
        where: {
            id: userId,
            isDeleted: false
        }
    });

    if (!person) {
        throw new Error('Person not found or already deleted');
    }

    const role = person.role as UserRole; // Get role from person record

    const result = await prisma.$transaction(async (tx) => {
        let deletedProfile;

        // Soft delete based on role from person record
        switch (role) {
            case UserRole.USER:
                await tx.user.findUniqueOrThrow({
                    where: {
                        email: person.email,
                        isDeleted: false
                    }
                });

                deletedProfile = await tx.user.update({
                    where: { email: person.email },
                    data: {
                        isDeleted: true,
                        updatedAt: new Date()
                    }
                });
                break;

            case UserRole.HOST:
                await tx.host.findUniqueOrThrow({
                    where: {
                        email: person.email,
                        isDeleted: false
                    }
                });

                deletedProfile = await tx.host.update({
                    where: { email: person.email },
                    data: {
                        isDeleted: true,
                        updatedAt: new Date()
                    }
                });
                break;

            case UserRole.ADMIN:
                await tx.admin.findUniqueOrThrow({
                    where: {
                        email: person.email,
                        isDeleted: false
                    }
                });

                deletedProfile = await tx.admin.update({
                    where: { email: person.email },
                    data: {
                        isDeleted: true,
                        updatedAt: new Date()
                    }
                });
                break;

            default:
                throw new Error('Invalid role');
        }

        // Also soft delete person
        await tx.person.update({
            where: { id: userId },
            data: {
                isDeleted: true,
                updatedAt: new Date()
            }
        });

        return deletedProfile;
    });

    return result;
};

// Get all users (regular users, not admins/hosts)
const getAllUsers = async (params: any, options: IPaginationOptions) => {
    const { page, limit, skip } = paginationHelper.calculatePagination(options);
    const { searchTerm, ...filterData } = params;

    const andConditions: Prisma.UserWhereInput[] = [];

    // Search conditions
    if (searchTerm) {
        andConditions.push({
            OR: [
                { name: { contains: searchTerm, mode: 'insensitive' } },
                { email: { contains: searchTerm, mode: 'insensitive' } },
                { contactNumber: { contains: searchTerm, mode: 'insensitive' } }
            ]
        });
    }

    // Filter conditions
    if (Object.keys(filterData).length > 0) {
        andConditions.push({
            AND: Object.keys(filterData).map(key => ({
                [key]: {
                    equals: (filterData as any)[key]
                }
            }))
        });
    }

    // Only regular users (not hosts or admins)
    andConditions.push({
        role: UserRole.USER,
        isDeleted: false
    });

    const whereConditions: Prisma.UserWhereInput = { AND: andConditions };

    const result = await prisma.user.findMany({
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
            name: true,
            email: true,
            role: true,
            profilePhoto: true,
            contactNumber: true,
            address: true,
            gender: true,
            interests: true,
            createdAt: true,
            updatedAt: true,
            _count: {
                select: {
                    participants: true,
                    reviews: true,
                    payments: true
                }
            }
        }
    });

    const total = await prisma.user.count({
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

// Get all hosts
const getAllHosts = async (params: any, options: IPaginationOptions) => {
    const { page, limit, skip } = paginationHelper.calculatePagination(options);
    const { searchTerm, ...filterData } = params;

    const andConditions: Prisma.HostWhereInput[] = [];

    // Search conditions
    if (searchTerm) {
        andConditions.push({
            OR: [
                { name: { contains: searchTerm, mode: 'insensitive' } },
                { email: { contains: searchTerm, mode: 'insensitive' } },
                { contactNumber: { contains: searchTerm, mode: 'insensitive' } }
            ]
        });
    }

    // Filter conditions
    if (Object.keys(filterData).length > 0) {
        andConditions.push({
            AND: Object.keys(filterData).map(key => ({
                [key]: {
                    equals: (filterData as any)[key]
                }
            }))
        });
    }

    // Only hosts
    andConditions.push({
        role: UserRole.HOST,
        isDeleted: false
    });

    const whereConditions: Prisma.HostWhereInput = { AND: andConditions };

    const result = await prisma.host.findMany({
        where: whereConditions,
        skip,
        take: limit,
        orderBy: options.sortBy && options.sortOrder ? {
            [options.sortBy]: options.sortOrder
        } : {
            createdAt: 'desc'
        },
        include: {
            _count: {
                select: {
                    events: true,
                    reviews: true
                }
            }
        }
    });

    const total = await prisma.host.count({
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

const getAllPersonsFromDB = async (params: any, options: IPaginationOptions) => {
    const { page, limit, skip } = paginationHelper.calculatePagination(options);
    const { searchTerm, ...filterData } = params;

    const andConditions: Prisma.PersonWhereInput[] = [];

    // Search only on email (since Person only has email)
    if (searchTerm) {
        andConditions.push({
            email: { contains: searchTerm, mode: 'insensitive' }
        });
    }

    // Filter conditions
    if (filterData.role) {
        andConditions.push({
            role: filterData.role
        });
        delete filterData.role;
    }

    // Other filters
    if (Object.keys(filterData).length > 0) {
        andConditions.push({
            AND: Object.keys(filterData).map(key => ({
                [key]: {
                    equals: (filterData as any)[key]
                }
            }))
        });
    }

    // Exclude deleted persons
    andConditions.push({
        isDeleted: false
    });

    const whereConditions: Prisma.PersonWhereInput = { AND: andConditions };

    const result = await prisma.person.findMany({
        where: whereConditions,
        skip,
        take: limit,
        orderBy: options.sortBy && options.sortOrder ? {
            [options.sortBy]: options.sortOrder
        } : {
            createdAt: 'desc'
        },
        include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    profilePhoto: true,
                    contactNumber: true,
                    address: true,
                    gender: true,
                    interests: true,
                    createdAt: true,
                    updatedAt: true
                }
            },
            host: {
                select: {
                    id: true,
                    name: true,
                    profilePhoto: true,
                    contactNumber: true,
                    address: true,
                    gender: true,
                    interests: true,
                    createdAt: true,
                    updatedAt: true
                }
            },
            admin: {
                select: {
                    id: true,
                    name: true,
                    profilePhoto: true,
                    contactNumber: true,
                    address: true,
                    gender: true,
                    interests: true,
                    createdAt: true,
                    updatedAt: true
                }
            }
        }
    });

    // Transform data
    const transformedData = result.map(person => {
        let profile = null;
        
        // Determine which profile to use based on role
        switch (person.role) {
            case 'USER':
                profile = person.user;
                break;
            case 'HOST':
                profile = person.host;
                break;
            case 'ADMIN':
                profile = person.admin;
                break;
        }

        return {
            id: person.id,
            email: person.email,
            role: person.role,
            isDeleted: person.isDeleted,
            createdAt: person.createdAt,
            updatedAt: person.updatedAt,
            profile: profile
        };
    });

    const total = await prisma.person.count({
        where: whereConditions
    });

    return {
        meta: {
            page,
            limit,
            total
        },
        data: transformedData
    };
};

// Get dashboard statistics
const getDashboardStats = async () => {
    const [
        totalUsers,
        totalHosts,
        totalAdmins,
        totalEvents,
        totalPayments,
        recentPayments,
        upcomingEvents
    ] = await Promise.all([
        // Total users (excluding deleted)
        prisma.user.count({ where: { isDeleted: false, role: UserRole.USER } }),

        // Total hosts (excluding deleted)
        prisma.host.count({ where: { isDeleted: false, role: UserRole.HOST } }),

        // Total admins (excluding deleted)
        prisma.admin.count({ where: { isDeleted: false, role: UserRole.ADMIN } }),

        // Total events
        prisma.event.count(),

        // Total payments (successful)
        prisma.payment.count({ where: { status: 'SUCCESS' } }),

        // Recent payments
        prisma.payment.findMany({
            where: { status: 'SUCCESS' },
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: { name: true, email: true }
                },
                event: {
                    select: { title: true, hostEmail: true }
                }
            }
        }),

        // Upcoming events (next 30 days)
        prisma.event.findMany({
            where: {
                dateTime: {
                    gte: new Date(),
                    lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                },
                status: 'OPEN'
            },
            take: 10,
            orderBy: { dateTime: 'asc' },
            include: {
                host: {
                    select: { name: true, email: true }
                },
                _count: {
                    select: { participants: true }
                }
            }
        })
    ]);

    // Calculate total revenue
    const revenueResult = await prisma.payment.aggregate({
        where: { status: 'SUCCESS' },
        _sum: { amount: true }
    });

    const totalRevenue = revenueResult._sum.amount || 0;

    return {
        stats: {
            totalUsers,
            totalHosts,
            totalAdmins,
            totalEvents,
            totalPayments,
            totalRevenue
        },
        recentPayments,
        upcomingEvents
    };
};

export const AdminService = {
    getAllAdmin,
    getPersonById,
    updatePersonIntoDB,
    deletePersonFromDB,
    softDeletePersonFromDB,
    getAllUsers,
    getAllHosts,
    getAllPersonsFromDB,
    getDashboardStats
};
