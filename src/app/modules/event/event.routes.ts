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
    auth(UserRole.HOST, UserRole.ADMIN),
    EventController.updateEventById
);


router.delete(
    "/delete/:id",
    auth(UserRole.ADMIN, UserRole.HOST),
    EventController.deleteEvent
);

router.post("/:id/join", auth(UserRole.USER), EventController.joinEvent);
router.post(
    "/:id/leave",
    auth(UserRole.USER),
    EventController.leaveEvent
);

router.get(
    "/:id/participants",
    auth(UserRole.ADMIN, UserRole.HOST, UserRole.USER),
    EventController.getParticipants
);


router.post(
    "/:id/review",
    auth(UserRole.USER, UserRole.ADMIN),
    EventController.createReview
);


router.get(
    "/host/:email",
    EventController.getHostByEmail
);

router.get(
    "/my-events",
    auth(UserRole.HOST),
    EventController.getMyEvents
);


export const EventRoutes = router;
