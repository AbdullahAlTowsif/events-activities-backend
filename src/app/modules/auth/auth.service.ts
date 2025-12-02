import * as bcrypt from 'bcryptjs';
import { Secret } from "jsonwebtoken";
import { prisma } from '../../utils/prisma';
import { jwtHelper } from '../../middlewares/jwtHelper';
import { envVars } from '../../config/env';

const loginUser = async (payload: {
    email: string,
    password: string
}) => {
    const userData = await prisma.user.findUniqueOrThrow({
        where: {
            email: payload.email
        }
    });

    const isCorrectPassword: boolean = await bcrypt.compare(payload.password, userData.password);

    if (!isCorrectPassword) {
        throw new Error("Password incorrect!")
    }
    const accessToken = jwtHelper.generateToken({
        email: userData.email,
        role: userData.role
    },
        envVars.JWT_ACCESS_SECRET as Secret,
        envVars.JWT_ACCESS_EXPIRES as string
    );

    const refreshToken = jwtHelper.generateToken({
        email: userData.email,
        role: userData.role
    },
        envVars.JWT_REFRESH_SECRET as Secret,
        envVars.JWT_REFRESH_EXPIRES as string,
    );

    return {
        accessToken,
        refreshToken
    };
};

const refreshToken = async (token: string) => {
    let decodedData;
    try {
        decodedData = jwtHelper.verifyToken(token, envVars.JWT_REFRESH_SECRET as Secret);
    }
    catch (err) {
        throw new Error("You are not authorized!")
    }

    const userData = await prisma.user.findUniqueOrThrow({
        where: {
            email: decodedData.email
        }
    });

    const accessToken = jwtHelper.generateToken({
        email: userData.email,
        role: userData.role
    },
        envVars.JWT_ACCESS_SECRET as Secret,
        envVars.JWT_ACCESS_EXPIRES as string
    );

    const refreshToken = jwtHelper.generateToken({
        email: userData.email,
        role: userData.role
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
    const userData = await prisma.user.findUniqueOrThrow({
        where: {
            email: user.email,
            isDeleted: false
        }
    });

    const isCorrectPassword: boolean = await bcrypt.compare(payload.oldPassword, userData.password);

    if (!isCorrectPassword) {
        throw new Error("Password incorrect!")
    }

    const hashedPassword: string = await bcrypt.hash(payload.newPassword, Number(envVars.BCRYPT_SALT_ROUND));

    await prisma.user.update({
        where: {
            email: userData.email
        },
        data: {
            password: hashedPassword
        }
    })

    return {
        message: "Password changed successfully!"
    }
};

// const forgotPassword = async (payload: { email: string }) => {
//     const userData = await prisma.user.findUniqueOrThrow({
//         where: {
//             email: payload.email,
//             status: UserStatus.ACTIVE
//         }
//     });

//     const resetPassToken = jwtHelper.generateToken(
//         { email: userData.email, role: userData.role },
//         config.jwt.reset_pass_secret as Secret,
//         config.jwt.reset_pass_token_expires_in as string
//     )

//     const resetPassLink = config.reset_pass_link + `?userId=${userData.id}&token=${resetPassToken}`

//     await emailSender(
//         userData.email,
//         `
//         <div>
//             <p>Dear User,</p>
//             <p>Your password reset link 
//                 <a href=${resetPassLink}>
//                     <button>
//                         Reset Password
//                     </button>
//                 </a>
//             </p>

//         </div>
//         `
//     )
// };

// const resetPassword = async (token: string, payload: { id: string, password: string }) => {

//     const userData = await prisma.user.findUniqueOrThrow({
//         where: {
//             id: payload.id,
//             status: UserStatus.ACTIVE
//         }
//     });

//     const isValidToken = jwtHelper.verifyToken(token, config.jwt.jwt_secret as Secret)

//     if (!isValidToken) {
//         throw new ApiError(httpStatus.FORBIDDEN, "Forbidden!")
//     }

//     // hash password
//     const password = await bcrypt.hash(payload.password, Number(config.salt_round));

//     // update into database
//     await prisma.user.update({
//         where: {
//             id: payload.id
//         },
//         data: {
//             password,
//             needPasswordChange: false
//         }
//     })
// };


const getMe = async (user: any) => {
    const accessToken = user.accessToken;
    const decodedData = jwtHelper.verifyToken(
        accessToken,
        envVars.JWT_ACCESS_SECRET as Secret
    );

    // Determine which model to query based on role
    let userData;
    const email = decodedData.email;
    const role = decodedData.role; // Assuming role is in the token

    switch (role) {
        case 'ADMIN':
            userData = await prisma.admin.findUniqueOrThrow({
                where: {
                    email: email,
                    isDeleted: false
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
                    isDeleted: true,
                    createdAt: true,
                    updatedAt: true,
                    // Include admin-specific relations if any
                }
            });
            break;

        case 'HOST':
            userData = await prisma.host.findUniqueOrThrow({
                where: {
                    email: email,
                    isDeleted: false
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
            });
            break;

        case 'USER':
        default:
            userData = await prisma.user.findUniqueOrThrow({
                where: {
                    email: email,
                    isDeleted: false
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
            });
            break;
    }

    return {
        success: true,
        message: 'User profile retrieved successfully',
        data: userData
    };
};


export const AuthServices = {
    loginUser,
    refreshToken,
    changePassword,
    getMe
}
