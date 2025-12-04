import { UserRole } from '@prisma/client';
import express from 'express';
import auth from '../../middlewares/auth';
import { AuthController } from './auth.controller';

const router = express.Router();

router.post(
    '/login',
    AuthController.loginPerson
);

router.post(
    '/refresh-token',
    AuthController.refreshToken
)

router.post(
    '/change-password',
    auth(
        UserRole.ADMIN,
        UserRole.HOST,
        UserRole.USER
    ),
    AuthController.changePassword
);
router.post("/logout", AuthController.logout);


router.get(
    '/me',
    AuthController.getMe
)

export const AuthRoutes = router;