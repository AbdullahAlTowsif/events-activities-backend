import { UserRole } from '@prisma/client';
import express from 'express';
import auth from '../../middlewares/auth';
import authRateLimiter from '../../middlewares/rateLimiter';
import { AuthController } from './auth.controller';

const router = express.Router();

router.post(
    '/login',
    authRateLimiter,
    AuthController.loginPerson
);

router.post(
    '/refresh-token',
    authRateLimiter,
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
    auth(UserRole.ADMIN, UserRole.HOST, UserRole.USER),
    AuthController.getMe
)

export const AuthRoutes = router;