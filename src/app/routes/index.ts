import express from 'express';
import { UserRoutes } from '../modules/user/user.routes';
import { AuthRoutes } from '../modules/auth/auth.routes';
import { EventRoutes } from '../modules/event/event.routes';
import { PaymentRoutes } from '../modules/payment/payment.routes';
import { HostRoutes } from '../modules/host/host.routes';
import { AdminRoutes } from '../modules/admin/admin.routes';
import { ReviewRoutes } from '../modules/review/review.route';


const router = express.Router();

const moduleRoutes = [
    {
        path: '/user',
        route: UserRoutes
    },
    {
        path: '/auth',
        route: AuthRoutes
    },
    {
        path: '/event',
        route: EventRoutes
    },
    {
        path: "/payment",
        route: PaymentRoutes
    },
    {
        path: "/host",
        route: HostRoutes
    },
    {
        path: "/admin",
        route: AdminRoutes
    },
    {
        path: "/review",
        route: ReviewRoutes
    }
];

moduleRoutes.forEach(route => router.use(route.path, route.route))

export default router;
