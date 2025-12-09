import { Router } from "express";
import { ReviewController } from "./review.controller";

const router = Router();

router.get("/", ReviewController.getAllReviews);
router.get("/:hostEmail", ReviewController.getReviewsByHostEmail);


export const ReviewRoutes = router;