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


const updateEventById = catchAsync(async (req: Request & { user?: any }, res: Response) => {
    const { id } = req.params;
    const user = req.user;

    const result = await EventService.updateEventById(id as string, user, req.body);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Event data updated!",
        data: result
    })
});


const deleteEvent = catchAsync(async (req: Request & { user?: any }, res: Response) => {
    const eventId = req.params.id;
    const user = req.user;

    const result = await EventService.deleteEvent(eventId as string, user);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Event deleted successfully!",
        data: result,
    });
});


const joinEvent = catchAsync(async (req: Request, res: Response) => {
    const userEmail = req.user?.email;
    const eventId = req.params.id;

    const result = await EventService.joinEvent(eventId as string, userEmail as string);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Joined event successfully",
        data: result,
    });
});

const leaveEvent = catchAsync(async (req: Request, res: Response) => {
    const eventId = req.params.id;
    const userEmail = req.user?.email;

    const result = await EventService.leaveEvent(eventId as string, userEmail);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Event left successfully",
        data: result,
    });
});


const getParticipants = catchAsync(async (req: Request, res: Response) => {
    const eventId = req.params.id;
    const requesterEmail = req.user?.email;
    const requesterRole = req.user?.role;

    const result = await EventService.getParticipants(
        eventId as string,
        requesterEmail,
        requesterRole
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Participants fetched successfully",
        data: result,
    });
});


const createReview = catchAsync(async (req: Request, res: Response) => {
  const eventId = req.params.id;
  const reviewerEmail = req.user?.email;

  const result = await EventService.createReview(eventId as string, reviewerEmail, req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Review posted successfully",
    data: result,
  });
});


const getHostByEmail = catchAsync(async (req: Request, res: Response) => {
    const email = req.params.email;

    const result = await EventService.getHostByEmail(email as string);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Host fetched successfully",
        data: result
    });
});


const getMyCreatedEvents = catchAsync(async (req: Request, res: Response) => {
    console.log(req);
    const email = req.user?.email;
    const role = req.user?.role;
    console.log(email, role, "from controller");

    const result = await EventService.getMyCreatedEvents(email, role);
    console.log("get my events controller", result);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "My events fetched successfully",
        // data: "data honde"
        data: result || null,
    });
});

export const EventController = {
    createEvent,
    getAllEvent,
    getEventById,
    updateEventById,
    deleteEvent,
    joinEvent,
    leaveEvent,
    getParticipants,
    createReview,
    getHostByEmail,
    getMyCreatedEvents
};
