import express from 'express';
import auth from '../../middlewares/auth';
import { UserRole } from '@prisma/client';
import { RecommendationController } from './recommendation.controller';

const router = express.Router();

router.get(
    '/ai-recommendations',
    auth(UserRole.USER),
    RecommendationController.getAIRecommendations
);

export const RecommendationRoutes = router;
