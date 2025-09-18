import express from 'express';
import { body } from 'express-validator';
import { validate } from '../../middlewares';
import {
  generateImage,
  saveImage,
  makeThumbnail,
  respondWithImage,
} from '../controllers/imageController';

const router = express.Router();

/**
 * POST /api/v1/images
 * Body:
 * {
 *   "topic": "space",
 *   "splashText": "Explore the Universe!",
 *   "style": "cinematic, colorful",
 *   "size": "1024x1024",
 *   "model": "dall-e-2"
 * }
 *
 * Flow:
 *  - validate -> generateImage (calls OpenAI) -> saveImage (downloads) -> makeThumbnail -> respondWithImage
 */
router
  .route('/')
  .post(
    body('topic').notEmpty().withMessage('topic is required').trim().escape(),
    body('splashText').optional().isString().trim().escape(),
    body('style').optional().isString().trim().escape(),
    body('size').optional().isIn(['256x256', '512x512', '1024x1024']),
    body('model').optional().isString().trim(),
    validate,
    generateImage,
    saveImage,
    makeThumbnail,
    respondWithImage
  );

export default router;