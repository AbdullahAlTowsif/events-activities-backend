import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status-codes"
import { EventService } from "./event.service";
import { Request, Response } from "express";
import pick from "../../helper/pick";
import { eventFilterableFields } from "./event.constant";

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

const getAllEvent = catchAsync(async (req: Request, res: Response) => {
    const filters = pick(req.query, eventFilterableFields)
    const options = pick(req.query, ["page", "limit", "sortBy", "sortOrder"])
    // const {page, limit, searchTerm, sortBy, sortOrder, role, status} = req.query;
    // const result = await UserService.getAllFromDB({page: Number(page), limit: Number(limit), searchTerm, sortBy, sortOrder, role, status});
    const result = await EventService.getAllEvent(filters, options);
    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "All Events retrieved successfully",
        meta: result.meta,
        data: result.data
    })
});


const getEventById = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await EventService.getEventById(id as string);
    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: 'Evenet retrieved successfully',
        data: result,
    });
});


export const EventController = {
    createEvent,
    getAllEvent,
    getEventById
};
