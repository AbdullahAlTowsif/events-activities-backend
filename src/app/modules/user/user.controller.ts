import { Request, Response } from "express";
import { UserService } from "./user.service";
import httpStatus from "http-status-codes";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { IJWTPayload } from "../../interfaces/common";
import pick from "../../helper/pick";
import { personFilterableFields } from "./user.constants";
import { JwtPayload } from "jsonwebtoken";

const createUser = catchAsync(async (req: Request, res: Response) => {
    const result = await UserService.createUser(req);
    console.log(req.body);
    sendResponse(res, {
        statusCode: 201,
        success: true,
        message: "User created successfully",
        data: result
    })
});


const createAdmin = catchAsync(async (req: Request, res: Response) => {

    const result = await UserService.createAdmin(req);
    sendResponse(res, {
        statusCode: 201,
        success: true,
        message: "Admin Created successfuly!",
        data: result
    })
});

const createHost = catchAsync(async (req: Request, res: Response) => {

    const result = await UserService.createHost(req);
    sendResponse(res, {
        statusCode: 201,
        success: true,
        message: "Host Created successfuly!",
        data: result
    })
});


const getAllFromDB = catchAsync(async (req: Request, res: Response) => {
    const filters = pick(req.query, personFilterableFields)
    const options = pick(req.query, ["page", "limit", "sortBy", "sortOrder"])
    // const {page, limit, searchTerm, sortBy, sortOrder, role, status} = req.query;
    // const result = await UserService.getAllFromDB({page: Number(page), limit: Number(limit), searchTerm, sortBy, sortOrder, role, status});
    const result = await UserService.getAllFromDB(filters, options);
    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "Person retrieved successfully",
        meta: result.meta,
        data: result.data
    })
});



const getMyProfile = catchAsync(async (req: Request & { user?: JwtPayload }, res: Response) => {

    const user = req.user;

    const result = await UserService.getMyProfile(user as JwtPayload);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "My profile data fetched!",
        data: result
    })
});


const updateMyProfie = catchAsync(async (req: Request & { user?: JwtPayload }, res: Response) => {

    const user = req.user;

    const result = await UserService.updateMyProfie(user as JwtPayload, req);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "My profile updated!",
        data: result
    })
});

export const UserController = {
    createUser,
    createAdmin,
    createHost,
    getMyProfile,
    getAllFromDB,
    updateMyProfie
}
