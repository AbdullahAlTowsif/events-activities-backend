import { UserRole } from '@prisma/client';
import express, { NextFunction, Request, Response } from 'express';
import { userValidation } from './user.validation';
import validateRequest from '../../middlewares/validateRequest';
import { fileUploader } from '../../helper/fileUploader';
import { UserController } from './user.controller';
import auth from '../../middlewares/auth';
import parseMultipartBody from '../../utils/parseMultipartBody';

const router = express.Router();

router.get(
    '/',
    auth(UserRole.ADMIN),
    UserController.getAllFromDB
);

router.get(
    '/me',
    auth(UserRole.ADMIN, UserRole.HOST, UserRole.USER),
    UserController.getMyProfile
)

router.post(
    "/create-admin",
    auth(UserRole.ADMIN),
    fileUploader.upload.single('file'),
    (req: Request, res: Response, next: NextFunction) => {
        try {
            req.body = userValidation.createAdmin.parse(parseMultipartBody(req.body.data))
            return UserController.createAdmin(req, res, next)
        } catch (err) {
            next(err);
        }
    }
);

router.post(
    "/create-host",
    auth(UserRole.ADMIN),
    fileUploader.upload.single('file'),
    (req: Request, res: Response, next: NextFunction) => {
        try {
            req.body = userValidation.createHost.parse(parseMultipartBody(req.body.data))
            return UserController.createHost(req, res, next)
        } catch (err) {
            next(err);
        }
    }
);

router.post(
    "/create-user",
    fileUploader.upload.single('file'),
    (req: Request, res: Response, next: NextFunction) => {
        try {
            req.body = userValidation.createUser.parse(parseMultipartBody(req.body.data))
            return UserController.createUser(req, res, next)
        } catch (err) {
            next(err);
        }
    }
);

router.patch(
    "/update-my-profile",
    auth(UserRole.ADMIN, UserRole.HOST, UserRole.USER),
    fileUploader.upload.single('file'),
    (req: Request, res: Response, next: NextFunction) => {
        try {
            req.body = parseMultipartBody(req.body.data)
            return next()
        } catch (err) {
            next(err);
        }
    },
    validateRequest(userValidation.updateMyProfileValidationSchema),
    UserController.updateMyProfile
);

router.get(
  "/my-paid-events",
  auth(UserRole.USER, UserRole.ADMIN),
  UserController.getMyPaidEvents
);


export const UserRoutes = router;