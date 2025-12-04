import { Admin, Host, Prisma, User, UserRole } from "@prisma/client";
import * as bcrypt from 'bcryptjs';
import { Request } from "express";
import { fileUploader } from "../../helper/fileUploader";
import { envVars } from "../../config/env";
import { prisma } from "../../utils/prisma";
import { IPaginationOptions } from "../../interfaces/pagination";
import { paginationHelper } from "../../helper/paginationHelper";
import { personSearchableFields } from "./user.constants";
import { JwtPayload } from "jsonwebtoken";

const createAdmin = async (req: Request): Promise<Admin> => {

    const isAdminExists = await prisma.admin.findFirst({
        where: {
            name: req.body.admin.name,
            email: req.body.admin.email
        }
    })

    if (isAdminExists) {
        throw new Error("Admin Already Exists")
    }

    const file = req.file;

    if (file) {
        const uploadToCloudinary = await fileUploader.uploadToCloudinary(file);
        req.body.admin.profilePhoto = uploadToCloudinary?.secure_url
    }

    const hashedPassword: string = await bcrypt.hash(req.body.password, Number(envVars.BCRYPT_SALT_ROUND))

    const personData = {
        // name: req.body.admin.name,
        email: req.body.admin.email,
        password: hashedPassword,
        role: UserRole.ADMIN,
        // contactNumber: req.body.admin.contactNumber,
        // gender: req.body.admin.gender,
        // interests: req.body.admin.interests || []
    }

    const result = await prisma.$transaction(async (transactionClient) => {
        await transactionClient.person.create({
            data: personData
        });

        const createdAdminData = await transactionClient.admin.create({
            data: {
                ...req.body.admin,
                password: hashedPassword
            }
        });

        return createdAdminData;
    });

    return result;
};


const createHost = async (req: Request): Promise<Host> => {

    const isHostExists = await prisma.host.findFirst({
        where: {
            name: req.body.host.name,
            email: req.body.host.email
        }
    })

    if (isHostExists) {
        throw new Error("Host Already Exists")
    }

    const file = req.file;

    if (file) {
        const uploadToCloudinary = await fileUploader.uploadToCloudinary(file);
        req.body.host.profilePhoto = uploadToCloudinary?.secure_url
    }

    const hashedPassword: string = await bcrypt.hash(req.body.password, Number(envVars.BCRYPT_SALT_ROUND))

    const personData = {
        // name: req.body.host.name,
        email: req.body.host.email,
        password: hashedPassword,
        role: UserRole.HOST,
        // contactNumber: req.body.host.contactNumber,
        // address: req.body.host.address,
        // gender: req.body.host.gender,
        // interests: req.body.host.interests || []
    }

    const result = await prisma.$transaction(async (transactionClient) => {
        await transactionClient.person.create({
            data: personData
        });

        const createdHostData = await transactionClient.host.create({
            data: {
                ...req.body.host,
                password: hashedPassword
            }
        });

        return createdHostData;
    });

    return result;
};


const createUser = async (req: Request): Promise<User> => {

    const isUserExists = await prisma.user.findFirst({
        where: {
            name: req.body.user.name,
            email: req.body.user.email
        }
    })

    if (isUserExists) {
        throw new Error("User Already Exists")
    }

    const file = req.file;
    console.log("file", file);
    console.log("req.body---->", req.body);

    if (file) {
        const uploadToCloudinary = await fileUploader.uploadToCloudinary(file);
        req.body.user.profilePhoto = uploadToCloudinary?.secure_url
    }

    const hashedPassword: string = await bcrypt.hash(req.body.password, Number(envVars.BCRYPT_SALT_ROUND))

    const personData = {
        // name: req.body.user.name,
        email: req.body.user.email,
        password: hashedPassword,
        role: UserRole.USER,
        // contactNumber: req.body.user.contactNumber,
        // address: req.body.user.address,
        // gender: req.body.user.gender,
        // interests: req.body.user.interests || []
    }
    console.log("user data", personData);

    const result = await prisma.$transaction(async (transactionClient) => {
        await transactionClient.person.create({
            data: personData
        });

        const createdUserData = await transactionClient.user.create({
            data: {
                ...req.body.user,
                password: hashedPassword
            }
        });

        return createdUserData;
    });

    // console.log("result", result);

    return result;
};



const getAllFromDB = async (params: any, options: IPaginationOptions) => {
    const { page, limit, skip } = paginationHelper.calculatePagination(options);
    const { searchTerm, ...filterData } = params;

    const andConditions: Prisma.PersonWhereInput[] = [];

    if (params.searchTerm) {
        andConditions.push({
            OR: personSearchableFields.map(field => ({
                [field]: {
                    contains: params.searchTerm,
                    mode: 'insensitive'
                }
            }))
        })
    };

    if (Object.keys(filterData).length > 0) {
        andConditions.push({
            AND: Object.keys(filterData).map(key => ({
                [key]: {
                    equals: (filterData as any)[key]
                }
            }))
        })
    };

    const whereConditions: Prisma.PersonWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

    const result = await prisma.person.findMany({
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
            email: true,
            role: true,
            createdAt: true,
            updatedAt: true,
            admin: true,
            host: true,
            user: true
        }
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
        data: result
    };
};


const getMyProfile = async (user: JwtPayload) => {
    const personInfo = await prisma.user.findUniqueOrThrow({
        where: {
            email: user?.email,
        },
        select: {
            id: true,
            email: true,
            role: true,
        },
    });

    let profileInfo;

    if (personInfo.role === UserRole.ADMIN) {
        profileInfo = await prisma.admin.findUnique({
            where: {
                email: personInfo.email,
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
                isDeleted: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    } else if (personInfo.role === UserRole.HOST) {
        profileInfo = await prisma.host.findUnique({
            where: {
                email: personInfo.email,
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
                isDeleted: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    } else if (personInfo.role === UserRole.USER) {
        profileInfo = await prisma.user.findUnique({
            where: {
                email: personInfo.email,
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
                isDeleted: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }

    return { ...personInfo, ...profileInfo };
};


const updateMyProfie = async (user: JwtPayload, req: Request) => {
    const personInfo = await prisma.person.findUniqueOrThrow({
        where: {
            email: user?.email,
            isDeleted: false
        }
    });

    const file = req.file;
    if (file) {
        const uploadToCloudinary = await fileUploader.uploadToCloudinary(file);
        req.body.profilePhoto = uploadToCloudinary?.secure_url;
    }

    // Prepare update data with proper type conversions
    const updateData = { ...req.body };

    let profileInfo;

    if (personInfo.role === UserRole.ADMIN) {
        profileInfo = await prisma.admin.update({
            where: {
                email: personInfo.email
            },
            data: updateData
        })
    }
    else if (personInfo.role === UserRole.HOST) {
        profileInfo = await prisma.host.update({
            where: {
                email: personInfo.email
            },
            data: updateData
        })
    }
    else if (personInfo.role === UserRole.USER) {
        profileInfo = await prisma.user.update({
            where: {
                email: personInfo.email
            },
            data: updateData
        })
    }

    return { ...profileInfo };
}


export const UserService = {
    createAdmin,
    createHost,
    createUser,
    getMyProfile,
    getAllFromDB,
    updateMyProfie
}