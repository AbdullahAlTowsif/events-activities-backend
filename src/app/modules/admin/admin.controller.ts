import { Request, Response } from 'express';
import { AdminService } from './admin.service';
import httpStatus from 'http-status-codes';
import { adminFilterableFields, personFilterableFields } from './admin.constant';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import pick from '../../helper/pick';
import { UserRole } from '@prisma/client';
import { email } from 'zod';

const getAllAdmin = catchAsync(async (req: Request, res: Response) => {
    const filters = pick(req.query, adminFilterableFields);
    const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);

    const result = await AdminService.getAllAdmin(filters, options);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Admins retrieved successfully',
        meta: result.meta,
        data: result.data
    });
});

const getPersonById = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await AdminService.getPersonById(id as string);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Person retrieved successfully',
        data: result
    });
});

const updatePersonIntoDB = catchAsync(async (req: Request, res: Response) => {
    const { id: personId } = req.params;
    console.log("req.params ------>", req.params);
    // console.log(personEmail);

    console.log('User ID:', personId);
    console.log('Request body:', req.body);

    const result = await AdminService.updatePersonIntoDB(personId as string, req.body);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Person updated successfully',
        data: result
    });
});

const deletePersonFromDB = catchAsync(async (req: Request, res: Response) => {
    const { id: userId } = req.params;
    const { role } = req.query;

    if (!role || !Object.values(UserRole).includes(role as UserRole)) {
        return sendResponse(res, {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: 'Valid role is required in query params (USER, HOST, or ADMIN)',
            data: null
        });
    }

    const result = await AdminService.deletePersonFromDB(userId as string, role as UserRole);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: `${role} deleted successfully`,
        data: result
    });
});

const softDeletePersonFromDB = catchAsync(async (req: Request, res: Response) => {
    const { id: userId } = req.params;

    console.log('User ID from params:', userId);
    console.log('Query params:', req.query);

    // Call service without role parameter (it will auto-detect)
    const result = await AdminService.softDeletePersonFromDB(userId as string);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Person soft deleted successfully',
        data: result
    });
});

const getAllUsers = catchAsync(async (req: Request, res: Response) => {
    const filters = pick(req.query, ['searchTerm', 'gender']);
    const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);

    const result = await AdminService.getAllUsers(filters, options);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Users retrieved successfully',
        meta: result.meta,
        data: result.data
    });
});

const getAllHosts = catchAsync(async (req: Request, res: Response) => {
    const filters = pick(req.query, ['searchTerm', 'gender']);
    const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);

    const result = await AdminService.getAllHosts(filters, options);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Hosts retrieved successfully',
        meta: result.meta,
        data: result.data
    });
});


const getAllPersonsFromDB = catchAsync(async (req: Request, res: Response) => {
    const filters = pick(req.query, personFilterableFields);
    const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
    
    const result = await AdminService.getAllPersonsFromDB(filters, options);
    
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Persons retrieved successfully',
        meta: result.meta,
        data: result.data
    });
});

const getDashboardStats = catchAsync(async (req: Request, res: Response) => {
    const result = await AdminService.getDashboardStats();

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Dashboard statistics retrieved successfully',
        data: result
    });
});

export const AdminController = {
    getAllAdmin,
    getPersonById,
    updatePersonIntoDB,
    deletePersonFromDB,
    softDeletePersonFromDB,
    getAllUsers,
    getAllHosts,
    getAllPersonsFromDB,
    getDashboardStats
};
