import { UserRole } from '@prisma/client';
import express, { NextFunction, Request, Response } from 'express';
import { userValidation } from './user.validation';
import { fileUploader } from '../../helper/fileUploader';
import { UserController } from './user.controller';
import auth from '../../middlewares/auth';

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
        req.body = userValidation.createAdmin.parse(JSON.parse(req.body.data))
        return UserController.createAdmin(req, res, next)
    }
);

router.post(
    "/create-host",
    auth(UserRole.ADMIN),
    fileUploader.upload.single('file'),
    (req: Request, res: Response, next: NextFunction) => {
        req.body = userValidation.createHost.parse(JSON.parse(req.body.data))
        return UserController.createHost(req, res, next)
    }
);

router.post(
    "/create-user",
    fileUploader.upload.single('file'),
    (req: Request, res: Response, next: NextFunction) => {
        req.body = userValidation.createUser.parse(JSON.parse(req.body.data))
        console.log(req.body);
        return UserController.createUser(req, res, next)
    }
);

router.patch(
    "/update-my-profile",
    auth( UserRole.ADMIN, UserRole.HOST, UserRole.USER),
    fileUploader.upload.single('file'),
    (req: Request, res: Response, next: NextFunction) => {
        req.body = JSON.parse(req.body.data)
        return UserController.updateMyProfile(req, res, next)
    }
);

router.get(
  "/my-paid-events",
  auth(UserRole.USER, UserRole.ADMIN),
  UserController.getMyPaidEvents
);


export const UserRoutes = router;