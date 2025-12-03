import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status-codes"
import { EventService } from "./event.service";
import { Request, Response } from "express";

const createEvent = catchAsync(async (req: Request, res: Response) => {
    const hostEmail = req.user?.email;
    console.log(req.user);
    console.log("req.body from controller --->", req.body);
    const result = await EventService.createEvent(hostEmail as string, req);
    console.log("result from controller", result);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Event created successfully",
        data: result,
    });
});

export const EventController = { createEvent };
