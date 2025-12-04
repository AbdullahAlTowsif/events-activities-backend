import express from 'express';
import { AdminController } from './admin.controller';
import auth from '../../middlewares/auth';
import { UserRole } from '@prisma/client';
import validateRequest from '../../middlewares/validateRequest';
import { updateUserValidation } from './admin.validation';

const router = express.Router();

router.get(
    '/',
    auth(UserRole.ADMIN),
    AdminController.getAllAdmin
);

router.get(
    '/:id',
    auth(UserRole.ADMIN),
    AdminController.getPersonById
);

router.patch(
    '/person/:id',
    auth(UserRole.ADMIN),
    AdminController.updatePersonIntoDB // Generic update
);

router.delete(
    '/person/:id/soft',
    auth(UserRole.ADMIN),
    AdminController.softDeletePersonFromDB // Generic soft delete
);

router.delete(
    '/person/:id',
    auth(UserRole.ADMIN),
    AdminController.deletePersonFromDB // Generic hard delete
);

// User management routes
router.get(
    '/users/all',
    auth(UserRole.ADMIN),
    AdminController.getAllUsers
);

// Host management routes
router.get(
    '/hosts/all',
    auth(UserRole.ADMIN),
    AdminController.getAllHosts
);

router.get(
    '/persons/all',
    auth(UserRole.ADMIN),
    AdminController.getAllPersonsFromDB
);

// Dashboard routes
router.get(
    '/dashboard/stats',
    auth(UserRole.ADMIN),
    AdminController.getDashboardStats
);

export const AdminRoutes = router;
