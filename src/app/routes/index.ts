import express from 'express';
import { UserRoutes } from '../modules/user/user.routes';
import { AuthRoutes } from '../modules/auth/auth.routes';
import { EventRoutes } from '../modules/event/event.routes';


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
    }
];

moduleRoutes.forEach(route => router.use(route.path, route.route))

export default router;
