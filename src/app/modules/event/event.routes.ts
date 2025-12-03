import { NextFunction, Request, Response, Router } from "express";
import auth from "../../middlewares/auth";
import { eventValidation } from "./event.validation";
import { EventController } from "./event.controller";
import { UserRole } from "@prisma/client";
import { fileUploader } from "../../helper/fileUploader";

const router = Router();

router.post(
    "/create-event",
    auth(UserRole.HOST),
    fileUploader.upload.single('file'),
    (req: Request, res: Response, next: NextFunction) => {
        console.log(req.body.data);
        req.body = eventValidation.createEventValidationSchema.parse(JSON.parse(req.body.data))
        // console.log("req.body from routes ---->", req.body);
        return EventController.createEvent(req, res, next)
    }
);

router.get(
    '/events',
    EventController.getAllEvent
);

router.get('/:id', EventController.getEventById);

router.patch(
    '/update/:id',
    auth(UserRole.ADMIN, UserRole.HOST),
    EventController.updateEventById
);


export const EventRoutes = router;
