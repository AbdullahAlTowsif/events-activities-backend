import { Admin, Host, User, UserRole } from "@prisma/client";
import * as bcrypt from 'bcryptjs';
import { Request } from "express";
import { fileUploader } from "../../helper/fileUploader";
import { envVars } from "../../config/env";
import { prisma } from "../../utils/prisma";
import { IJWTPayload } from "../../interfaces/common";

const createAdmin = async (req: Request): Promise<Admin> => {

    const isAdminExists = await prisma.admin.findFirst({
        where: {
            name: req.body.name,
            email: req.body.email
        }
    })

    if (isAdminExists) {
        throw new Error("Admin Already Exists")
    }

    const file = req.file;

    if (file) {
        const uploadToCloudinary = await fileUploader.uploadToCloudinary(file);
        req.body.profilePhoto = uploadToCloudinary?.secure_url
    }

    const hashedPassword: string = await bcrypt.hash(req.body.password, Number(envVars.BCRYPT_SALT_ROUND))

    const adminData = {
        name: req.body.name,
        email: req.body.email,
        password: hashedPassword,
        role: UserRole.ADMIN,
        contactNumber: req.body.contactNumber,
        gender: req.body.gender,
        interests: req.body.interests || []
    }

    const result = await prisma.admin.create({
        data: adminData
    })

    return result;
};


const createHost = async (req: Request): Promise<Host> => {

    const isHostExists = await prisma.host.findFirst({
        where: {
            name: req.body.name,
            email: req.body.email
        }
    })

    if (isHostExists) {
        throw new Error("Host Already Exists")
    }

    const file = req.file;

    if (file) {
        const uploadToCloudinary = await fileUploader.uploadToCloudinary(file);
        req.body.profilePhoto = uploadToCloudinary?.secure_url
    }

    const hashedPassword: string = await bcrypt.hash(req.body.password, Number(envVars.BCRYPT_SALT_ROUND))

    const hostData = {
        name: req.body.name,
        email: req.body.email,
        password: hashedPassword,
        role: UserRole.HOST,
        contactNumber: req.body.contactNumber,
        address: req.body.address,
        gender: req.body.gender,
        interests: req.body.interests || []
    }

    const result = await prisma.host.create({
        data: hostData
    })

    return result;
};


const createUser = async (req: Request): Promise<User> => {

    const isUserExists = await prisma.user.findFirst({
        where: {
            name: req.body.name,
            email: req.body.email
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
        req.body.profilePhoto = uploadToCloudinary?.secure_url
    }

    const hashedPassword: string = await bcrypt.hash(req.body.password, Number(envVars.BCRYPT_SALT_ROUND))

    const userData = {
        name: req.body.name,
        email: req.body.email,
        password: hashedPassword,
        role: UserRole.USER,
        contactNumber: req.body.contactNumber,
        address: req.body.address,
        gender: req.body.gender,
        interests: req.body.interests || []
    }
    console.log("host data", userData);

    const result = await prisma.user.create({
        data: userData
    })

    // console.log("result", result);

    return result;
};



// const getAllFromDB = async (params: any, options: IPaginationOptions) => {
//     const { page, limit, skip } = paginationHelper.calculatePagination(options);
//     const { searchTerm, ...filterData } = params;

//     const andConditions: Prisma.UserWhereInput[] = [];

//     if (params.searchTerm) {
//         andConditions.push({
//             OR: userSearchableFields.map(field => ({
//                 [field]: {
//                     contains: params.searchTerm,
//                     mode: 'insensitive'
//                 }
//             }))
//         })
//     };

//     if (Object.keys(filterData).length > 0) {
//         andConditions.push({
//             AND: Object.keys(filterData).map(key => ({
//                 [key]: {
//                     equals: (filterData as any)[key]
//                 }
//             }))
//         })
//     };

//     const whereConditions: Prisma.UserWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

//     const result = await prisma.user.findMany({
//         where: whereConditions,
//         skip,
//         take: limit,
//         orderBy: options.sortBy && options.sortOrder ? {
//             [options.sortBy]: options.sortOrder
//         } : {
//             createdAt: 'desc'
//         },
//         select: {
//             id: true,
//             email: true,
//             role: true,
//             needPasswordChange: true,
//             status: true,
//             createdAt: true,
//             updatedAt: true,
//             admin: true,
//             patient: true,
//             doctor: true
//         }
//     });

//     const total = await prisma.user.count({
//         where: whereConditions
//     });

//     return {
//         meta: {
//             page,
//             limit,
//             total
//         },
//         data: result
//     };
// };

// const changeProfileStatus = async (id: string, status: UserRole) => {
//     const userData = await prisma.user.findUniqueOrThrow({
//         where: {
//             id
//         }
//     });

//     const updateUserStatus = await prisma.user.update({
//         where: {
//             id
//         },
//         data: status
//     });

//     return updateUserStatus;
// };

const getMyProfile = async (user: IJWTPayload) => {
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


// const updateMyProfie = async (user: IJWTPayload, req: Request) => {
//     const userInfo = await prisma.user.findUniqueOrThrow({
//         where: {
//             email: user?.email,
//             status: UserStatus.ACTIVE
//         }
//     });

//     const file = req.file;
//     if (file) {
//         const uploadToCloudinary = await fileUploader.uploadToCloudinary(file);
//         req.body.profilePhoto = uploadToCloudinary?.secure_url;
//     }

//     // Prepare update data with proper type conversions
//     const updateData = { ...req.body };

//     // Convert numeric fields from string to number
//     if (userInfo.role === UserRole.DOCTOR) {
//         if (updateData.experience) {
//             updateData.experience = parseInt(updateData.experience);
//         }
//         if (updateData.appointmentFee) {
//             updateData.appointmentFee = parseInt(updateData.appointmentFee);
//         }
//     }

//     let profileInfo;

//     if (userInfo.role === UserRole.SUPER_ADMIN || userInfo.role === UserRole.ADMIN) {
//         profileInfo = await prisma.admin.update({
//             where: {
//                 email: userInfo.email
//             },
//             data: updateData
//         })
//     }
//     else if (userInfo.role === UserRole.DOCTOR) {
//         profileInfo = await prisma.doctor.update({
//             where: {
//                 email: userInfo.email
//             },
//             data: updateData
//         })
//     }
//     else if (userInfo.role === UserRole.PATIENT) {
//         profileInfo = await prisma.patient.update({
//             where: {
//                 email: userInfo.email
//             },
//             data: updateData
//         })
//     }

//     return { ...profileInfo };
// }


export const UserService = {
    createAdmin,
    createHost,
    createUser,
    getMyProfile,
}