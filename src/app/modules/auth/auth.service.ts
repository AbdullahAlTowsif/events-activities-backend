import * as bcrypt from 'bcryptjs';
import { Secret } from "jsonwebtoken";
import httpStatus from "http-status-codes";
import { jwtHelper } from '../../middlewares/jwtHelper';
import ApiError from '../../errors/ApiError';
import { envVars } from '../../config/env';
import prisma from '../../utils/prisma';

const loginPerson = async (payload: {
    email: string,
    password: string
}) => {
    const personData = await prisma.person.findUnique({
        where: {
            email: payload.email,
            isDeleted: false
        }
    });

    // Generic message for both "no account" and "wrong password" to prevent user enumeration
    if (!personData) {
        throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid email or password");
    }

    const isCorrectPassword: boolean = await bcrypt.compare(payload.password, personData.password);

    if (!isCorrectPassword) {
        throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid email or password");
    }
    const accessToken = jwtHelper.generateToken({
        // id: personData.id,
        email: personData.email,
        role: personData.role
    },
        envVars.JWT_ACCESS_SECRET as Secret,
        envVars.JWT_ACCESS_EXPIRES as string
    );

    const refreshToken = jwtHelper.generateToken({
        // id: personData.id,
        email: personData.email,
        role: personData.role
    },
        envVars.JWT_REFRESH_SECRET as Secret,
        envVars.JWT_REFRESH_EXPIRES as string,
    );

    return {
        accessToken,
        refreshToken
    };
};

// issue new access and refresh tokens when the current access token has expired
const refreshToken = async (token: string) => {
    let decodedData;
    try {
        decodedData = jwtHelper.verifyToken(token, envVars.JWT_REFRESH_SECRET as Secret);
    }
    catch (err) {
        throw new ApiError(httpStatus.UNAUTHORIZED, "You are not authorized!")
    }

    const personData = await prisma.person.findUniqueOrThrow({
        where: {
            email: decodedData.email
        }
    });

    const accessToken = jwtHelper.generateToken({
        // id: personData.id,
        email: personData.email,
        role: personData.role
    },
        envVars.JWT_ACCESS_SECRET as Secret,
        envVars.JWT_ACCESS_EXPIRES as string
    );

    const refreshToken = jwtHelper.generateToken({
        // id: personData.id,
        email: personData.email,
        role: personData.role
    },
        envVars.JWT_REFRESH_SECRET as Secret,
        envVars.JWT_REFRESH_EXPIRES as string,
    );

    return {
        accessToken,
        refreshToken
    };

};

const changePassword = async (user: any, payload: any) => {
    const personData = await prisma.person.findUniqueOrThrow({
        where: {
            email: user.email,
            isDeleted: false
        }
    });

    const isCorrectPassword: boolean = await bcrypt.compare(payload.oldPassword, personData.password);

    if (!isCorrectPassword) {
        throw new ApiError(httpStatus.UNAUTHORIZED, "Old password is incorrect!")
    }

    const hashedPassword: string = await bcrypt.hash(payload.newPassword, Number(envVars.BCRYPT_SALT_ROUND));

    await prisma.person.update({
        where: {
            email: personData.email
        },
        data: {
            password: hashedPassword
        }
    })

    return {
        message: "Password changed successfully!"
    }
};

const getMe = async (user: any) => {
    const accessToken = user.accessToken;
    const decodedData = jwtHelper.verifyToken(accessToken, envVars.JWT_ACCESS_SECRET as Secret);

    const personData = await prisma.person.findUniqueOrThrow({
        where: {
            email: decodedData.email,
            isDeleted: false
        },
        select: {
            id: true,
            email: true,
            role: true,
            createdAt: true,
            updatedAt: true,
            admin: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    profilePhoto: true,
                    contactNumber: true,
                    address: true,
                    gender: true,
                    interests: true,
                    isDeleted: true,
                    createdAt: true,
                    updatedAt: true,
                }
            },
            host: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    profilePhoto: true,
                    contactNumber: true,
                    address: true,
                    gender: true,
                    interests: true,
                    isDeleted: true,
                    createdAt: true,
                    updatedAt: true,
                    // Include host-specific relations
                    // events: {
                    //     where: { isDeleted: false },
                    //     select: {
                    //         id: true,
                    //         title: true,
                    //         description: true,
                    //         date: true,
                    //         location: true,
                    //         category: true,
                    //         // ... other event fields
                    //     }
                    // },
                    // reviews: {
                    //     where: { isDeleted: false },
                    //     select: {
                    //         id: true,
                    //         rating: true,
                    //         comment: true,
                    //         createdAt: true,
                    //         // ... other review fields
                    //     }
                    // }
                }
            },
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    profilePhoto: true,
                    contactNumber: true,
                    address: true,
                    gender: true,
                    interests: true,
                    isDeleted: true,
                    createdAt: true,
                    updatedAt: true,
                    // Include user-specific relations
                    // participants: {
                    //     where: { isDeleted: false },
                    //     select: {
                    //         id: true,
                    //         status: true,
                    //         event: {
                    //             select: {
                    //                 id: true,
                    //                 title: true,
                    //                 date: true,
                    //                 location: true
                    //             }
                    //         }
                    //     }
                    // },
                    // reviews: {
                    //     where: { isDeleted: false },
                    //     select: {
                    //         id: true,
                    //         rating: true,
                    //         comment: true,
                    //         createdAt: true,
                    //         event: {
                    //             select: {
                    //                 id: true,
                    //                 title: true
                    //             }
                    //         }
                    //     }
                    // },
                    // payments: {
                    //     where: { isDeleted: false },
                    //     select: {
                    //         id: true,
                    //         amount: true,
                    //         status: true,
                    //         createdAt: true,
                    //         event: {
                    //             select: {
                    //                 id: true,
                    //                 title: true
                    //             }
                    //         }
                    //     }
                    // }
                }
            }
        }
    });

    return personData;
}


export const AuthServices = {
    loginPerson,
    refreshToken,
    changePassword,
    getMe
}
