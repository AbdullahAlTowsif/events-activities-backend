import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import { RecommendationService } from './recommendation.service';
import sendResponse from '../../utils/sendResponse';
import httpStatus from "http-status-codes";

const getAIRecommendations = catchAsync(async (req: Request, res: Response) => {
    const userEmail = req.user?.email;
    console.log(userEmail);
    const result = await RecommendationService.getAIEventRecommendation(userEmail);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'AI event recommendations retrieved successfully',
        data: result,
    });
});

export const RecommendationController = {
    getAIRecommendations,
};
