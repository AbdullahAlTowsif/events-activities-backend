import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status-codes";
import { CookieOptions } from "express";
import { AuthServices } from "./auth.service";
import catchAsync from "../../utils/catchAsync";
import { envVars } from "../../config/env";
import sendResponse from "../../utils/sendResponse";
import parseExpiryToMs from "../../utils/parseExpiryToMs";

// Cookies are marked secure + SameSite=none only when served over HTTPS
// (production); dev uses http with lax (M5).
const isProduction = envVars.NODE_ENV === "production";

const authCookieOptions = (maxAge: number): CookieOptions => ({
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge,
});

const clearCookieOptions: CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
};

const setAuthCookies = (
    res: Response,
    accessToken: string,
    refreshToken: string,
    accessTokenMaxAge: number,
    refreshTokenMaxAge: number
) => {
    res.cookie("accessToken", accessToken, authCookieOptions(accessTokenMaxAge));
    res.cookie("refreshToken", refreshToken, authCookieOptions(refreshTokenMaxAge));
};

const loginPerson = catchAsync(async (req: Request, res: Response) => {
    const accessTokenExpiresIn = envVars.JWT_ACCESS_EXPIRES as string;
    const refreshTokenExpiresIn = envVars.JWT_REFRESH_EXPIRES as string;

    const accessTokenMaxAge = parseExpiryToMs(accessTokenExpiresIn);
    const refreshTokenMaxAge = parseExpiryToMs(refreshTokenExpiresIn);

    const result = await AuthServices.loginPerson(req.body);
    const { refreshToken, accessToken } = result;

    setAuthCookies(res, accessToken, refreshToken, accessTokenMaxAge, refreshTokenMaxAge);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Logged in successfully!",
        data: {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken
        }
    });
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
    const { refreshToken } = req.cookies;

    const accessTokenExpiresIn = envVars.JWT_ACCESS_EXPIRES as string;
    const refreshTokenExpiresIn = envVars.JWT_REFRESH_EXPIRES as string;

    const accessTokenMaxAge = parseExpiryToMs(accessTokenExpiresIn);
    const refreshTokenMaxAge = parseExpiryToMs(refreshTokenExpiresIn);

    const result = await AuthServices.refreshToken(refreshToken);

    setAuthCookies(res, result.accessToken, result.refreshToken, accessTokenMaxAge, refreshTokenMaxAge);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Access token genereated successfully!",
        data: {
            message: "Access token genereated successfully!",
        },
    });
});

const changePassword = catchAsync(
    async (req: Request & { user?: any }, res: Response) => {
        const user = req.user;

        const result = await AuthServices.changePassword(user, req.body);

        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "Password Changed successfully",
            data: result,
        });
    }
);

const getMe = catchAsync(async (req: Request & { user?: any }, res: Response) => {
    const user = req.cookies;

    const result = await AuthServices.getMe(user);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Profile retrieved successfully",
        data: result,
    });
});


const logout = catchAsync(async (req: Request, res: Response, next: NextFunction) => {

    res.clearCookie("accessToken", clearCookieOptions)
    res.clearCookie("refreshToken", clearCookieOptions)

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "User Logged Out Successfully",
        data: null,
    })
})


export const AuthController = {
    loginPerson,
    refreshToken,
    changePassword,
    getMe,
    logout
};