import { NextFunction, Request, Response, Router } from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { eventValidation } from "./event.validation";
import { EventController } from "./event.controller";
import { UserRole } from "@prisma/client";
import { fileUploader } from "../../helper/fileUploader";
import parseMultipartBody from "../../utils/parseMultipartBody";

const router = Router();

router.post(
    "/create-event",
    auth(UserRole.HOST),
    fileUploader.upload.single('file'),
    (req: Request, res: Response, next: NextFunction) => {
        try {
            req.body = eventValidation.createEventValidationSchema.parse(parseMultipartBody(req.body.data))
            return EventController.createEvent(req, res, next)
        } catch (err) {
            next(err);
        }
    }
);

router.get(
    '/events',
    EventController.getAllEvent
);

router.get(
    "/host/my-created-events",
    auth(UserRole.HOST),
    EventController.getMyCreatedEvents
);

router.get('/:id', EventController.getEventById);

router.patch(
    '/update/:id',
    auth(UserRole.HOST, UserRole.ADMIN),
    validateRequest(eventValidation.updateEventValidationSchema),
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
    validateRequest(eventValidation.createReviewValidationSchema),
    EventController.createReview
);


router.get(
    "/host/:email",
    EventController.getHostByEmail
);




export const EventRoutes = router;