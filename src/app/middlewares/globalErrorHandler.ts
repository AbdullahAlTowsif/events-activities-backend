import { Prisma } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status-codes";
import { ZodError } from "zod";
import ApiError from "../errors/ApiError";

// Sanitize error to prevent exposing sensitive information in production
const sanitizeError = (error: any) => {
    // Don't expose Prisma errors in production
    if (process.env.NODE_ENV === "production" && error?.code?.startsWith("P")) {
        return {
            message: "Database operation failed",
            errorDetails: null,
        };
    }
    return error;
};

const globalErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    console.error({ err });

    let statusCode: number = httpStatus.INTERNAL_SERVER_ERROR;
    let success = false;
    let message = err.message || "Something went wrong!";
    let error = err;

    if (err instanceof ApiError) {
        statusCode = err.statusCode;
        message = err.message || httpStatus.getStatusText(err.statusCode);
    } else if (err instanceof ZodError) {
        statusCode = httpStatus.BAD_REQUEST;
        message = "Validation failed";
        error = err.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
        }));
    } else if (err instanceof Prisma.PrismaClientValidationError) {
        statusCode = httpStatus.BAD_REQUEST;
        message = "Validation Error";
        error = err.message;
    } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
            statusCode = httpStatus.CONFLICT;
            message = "Duplicate Key error";
            error = err.meta;
        } else if (err.code === "P2025") {
            statusCode = httpStatus.NOT_FOUND;
            message = "Record not found";
            error = err.meta;
        } else if (err.code === "P2003") {
            statusCode = httpStatus.BAD_REQUEST;
            message = "Related record is missing or referenced by other records";
            error = err.meta;
        }
    } else if (process.env.NODE_ENV === "production") {
        // Never leak internal error details to clients in production
        message = "Something went wrong!";
        error = null;
    }

    const sanitizedError = sanitizeError(error);

    res.status(statusCode).json({
        success,
        message,
        error: sanitizedError,
    });
};

export default globalErrorHandler;