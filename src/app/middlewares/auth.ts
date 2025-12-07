import { NextFunction, Request, Response } from "express"
import httpStatus from "http-status-codes";
import { Secret } from "jsonwebtoken";
import ApiError from "../errors/ApiError";
import { jwtHelper } from "./jwtHelper";
import { envVars } from "../config/env";

const auth = (...roles: string[]) => {
    return async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
        try {
            let token = req.cookies.accessToken;

            if (!token && req.headers.authorization) {
                // Extract token from "Bearer <token>"
                token = req.headers.authorization.split(' ')[1];
            }
            if (!token) {
                throw new ApiError(httpStatus.UNAUTHORIZED, "You are not authorized")
            }

            const verifyUser = jwtHelper.verifyToken(token, envVars.JWT_ACCESS_SECRET as Secret)
            req.user = verifyUser;

            if (roles.length && !roles.includes(verifyUser.role)) {
                throw new ApiError(httpStatus.UNAUTHORIZED, "You are not authorized")
            }
            next();
        } catch (error) {
            next(error);
        }
    }
}

export default auth;
