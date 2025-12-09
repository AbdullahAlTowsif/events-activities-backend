import ApiError from "../../errors/ApiError";
import prisma from "../../utils/prisma";
import httpStatus from "http-status-codes";

const getAllReviews = async () => {
    const reviews = await prisma.review.findMany({
        orderBy: {
            createdAt: "desc",
        },
        include: {
            reviewer: {
                select: {
                    name: true,
                    email: true,
                    profilePhoto: true,
                },
            },
            host: {
                select: {
                    name: true,
                    email: true,
                    profilePhoto: true,
                },
            },
        },
    });

    return reviews;
};

const getReviewsByHostEmail = async (hostEmail: string) => {
    // 1. Check Host Exists
    const host = await prisma.host.findUnique({
        where: { email: hostEmail },
    });

    if (!host) {
        throw new ApiError(httpStatus.NOT_FOUND, "Host not found");
    }

    // 2. Fetch reviews for this host
    const reviews = await prisma.review.findMany({
        where: { hostEmail },
        orderBy: {
            createdAt: "desc",
        },
        include: {
            reviewer: {
                select: {
                    name: true,
                    email: true,
                    profilePhoto: true,
                },
            },
        },
    });

    return {
        host: {
            email: host.email,
            name: host.name,
            profilePhoto: host.profilePhoto,
        },
        reviews,
    };
};



export const ReviewService = {
    getAllReviews,
    getReviewsByHostEmail
};
