import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { ReviewService } from "./review.service";
import { Request, Response } from "express";
import httpStatus from "http-status-codes";

const getAllReviews = async (req: Request, res: Response) => {
    const result = await ReviewService.getAllReviews();

    res.status(200).json({
        success: true,
        message: "All reviews retrieved successfully",
        data: result,
    });
};

const getReviewsByHostEmail = catchAsync(async (req: Request, res: Response) => {
    const hostEmail = req.params.hostEmail;

    const result = await ReviewService.getReviewsByHostEmail(hostEmail as string);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Reviews retrieved successfully",
        data: result,
    });
});

export const ReviewController = {
    getAllReviews,
    getReviewsByHostEmail
};
