import express from 'express';
import auth from '../../middlewares/auth';
import { UserRole } from '@prisma/client';
import { HostApplicationController } from './host.controller';

const router = express.Router();


router.post(
    '/apply',
    auth(UserRole.USER),
    HostApplicationController.applyToBeHost
);

router.get(
    '/my-applications',
    auth(UserRole.USER),
    HostApplicationController.getMyApplications
);

// Admin routes
router.get(
    '/admin/applications',
    auth(UserRole.ADMIN),
    HostApplicationController.getAllApplications
);

router.put(
    '/:applicationId/status',
    auth(UserRole.ADMIN),
    HostApplicationController.updateApplicationStatus
);

export const HostRoutes = router;
