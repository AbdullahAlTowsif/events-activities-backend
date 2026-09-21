import { Admin, Host, Person, Prisma, User, UserRole } from "@prisma/client";
import { adminSearchAbleFields } from "./admin.constant";
import { paginationHelper } from "../../helper/paginationHelper";
import { IPaginationOptions } from "../../interfaces/pagination";
import { IAdminFilterRequest } from "./admin.interface";
import prisma from "../../utils/prisma";
import ApiError from "../../errors/ApiError";
import httpStatus from "http-status-codes";

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
        },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            profilePhoto: true,
            contactNumber: true,
            about: true,
            address: true,
            gender: true,
            interests: true,
            isDeleted: true,
            createdAt: true,
            updatedAt: true,
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
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    profilePhoto: true,
                    contactNumber: true,
                    isDeleted: true,
                    createdAt: true,
                    updatedAt: true
                }
            },
            host: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    profilePhoto: true,
                    contactNumber: true,
                    isDeleted: true,
                    createdAt: true,
                    updatedAt: true
                }
            },
            admin: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    profilePhoto: true,
                    contactNumber: true,
                    isDeleted: true,
                    createdAt: true,
                    updatedAt: true
                }
            }
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
    personId: string,
    data: Partial<User & Host & Admin>
): Promise<User | Host | Admin> => {
    console.log("userId", personId);

    // Fetch the person (parent)
    const person = await prisma.person.findUnique({
        where: { id: personId, isDeleted: false },
    });

    if (!person) {
        throw new ApiError(httpStatus.NOT_FOUND, "Person not found");
    }

    const role = person.role;
    const email = person.email;

    let result;

    // Whitelist writable fields (C4/H5) — email, password, role and isDeleted are never accepted from the client.
    const writableFields = [
        "name",
        "profilePhoto",
        "contactNumber",
        "about",
        "address",
        "gender",
        "interests",
    ] as const;

    const updateData: Record<string, unknown> = {};
    for (const field of writableFields) {
        if (data[field as keyof typeof data] !== undefined) {
            updateData[field] = data[field as keyof typeof data];
        }
    }

    if (Object.keys(updateData).length === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, "No writable fields provided");
    }

    // Update child table based on role
    switch (role) {
        case UserRole.USER: {
            const existingUser = await prisma.user.findUnique({
                where: { email: email },
            });

            if (!existingUser) {
                throw new ApiError(404, "User record missing for this person");
            }

            result = await prisma.user.update({
                where: { email: email },
                data: updateData,
            });
            break;
        }

        case UserRole.HOST: {
            const existingHost = await prisma.host.findUnique({
                where: { email: email },
            });

            if (!existingHost) {
                throw new ApiError(404, "Host record missing for this person");
            }

            result = await prisma.host.update({
                where: { email: email },
                data: updateData,
            });
            break;
        }

        case UserRole.ADMIN: {
            const existingAdmin = await prisma.admin.findUnique({
                where: { email: email },
            });

            if (!existingAdmin) {
                throw new ApiError(404, "Admin record missing for this person");
            }

            result = await prisma.admin.update({
                where: { email: email },
                data: updateData,
            });
            break;
        }

        default:
            throw new ApiError(400, "Invalid role");
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
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            profilePhoto: true,
            contactNumber: true,
            about: true,
            address: true,
            gender: true,
            interests: true,
            isDeleted: true,
            createdAt: true,
            updatedAt: true,
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

// Get dashboard statistics

const getAllPersonsFromDB = async (params: any, options: IPaginationOptions) => {
    const { page, limit, skip } = paginationHelper.calculatePagination(options);
    const { searchTerm, ...filterData } = params;

    const andConditions: Prisma.PersonWhereInput[] = [];

    // SEARCH (email only)
    if (searchTerm) {
        andConditions.push({
            email: { contains: searchTerm, mode: "insensitive" },
        });
    }

    // ROLE FILTER (if provided)
    if (filterData.role) {
        andConditions.push({
            role: filterData.role,
        });
        delete filterData.role;
    }

    // Filter Handling
    const otherFilters = [];

    // isDeleted filter (only if explicitly sent)
    if (filterData.isDeleted !== undefined) {
        otherFilters.push({
            isDeleted:
                filterData.isDeleted === "true" ||
                filterData.isDeleted === true,
        });
        delete filterData.isDeleted;
    }

    // Other filters (strict equality)
    for (const key of Object.keys(filterData)) {
        otherFilters.push({
            [key]: {
                equals: (filterData as any)[key],
            },
        });
    }

    // Apply final AND conditions
    if (otherFilters.length > 0) {
        andConditions.push({ AND: otherFilters });
    }

    const whereConditions: Prisma.PersonWhereInput =
        andConditions.length > 0 ? { AND: andConditions } : {};

    // Query persons + profile info
    const result = await prisma.person.findMany({
        where: whereConditions,
        skip,
        take: limit,
        orderBy:
            options.sortBy && options.sortOrder
                ? { [options.sortBy]: options.sortOrder }
                : { createdAt: "desc" },
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
                    updatedAt: true,
                },
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
                    updatedAt: true,
                },
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
                    updatedAt: true,
                },
            },
        },
    });

    // Transform output
    const transformedData = result.map((person) => {
        let profile = null;

        switch (person.role) {
            case "USER":
                profile = person.user;
                break;
            case "HOST":
                profile = person.host;
                break;
            case "ADMIN":
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
            profile,
        };
    });

    const total = await prisma.person.count({
        where: whereConditions,
    });

    return {
        meta: {
            page,
            limit,
            total,
        },
        data: transformedData,
    };
};

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
