import { Request, Response } from 'express';
import httpStatus from 'http-status-codes';
import sendResponse from '../../utils/sendResponse';
import catchAsync from '../../utils/catchAsync';
import { HostApplicationService } from './host.service';

const applyToBeHost = catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const result = await HostApplicationService.applyToBeHost(user.email, req.body);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: 'Host application submitted successfully',
        data: result
    });
});

const getMyApplications = catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const result = await HostApplicationService.getMyApplications(user.email);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Applications retrieved successfully',
        data: result
    });
});

const getAllApplications = catchAsync(async (req: Request, res: Response) => {
    const result = await HostApplicationService.getAllApplications();

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'All applications retrieved successfully',
        data: result
    });
});

const updateApplicationStatus = catchAsync(async (req: Request, res: Response) => {
    const admin = (req as any).user;
    const { applicationId } = req.params;

    const result = await HostApplicationService.updateApplicationStatus(
        applicationId as string,
        admin.email,
        req.body
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Application status updated successfully',
        data: result
    });
});

export const HostApplicationController = {
    applyToBeHost,
    getMyApplications,
    getAllApplications,
    updateApplicationStatus
};
