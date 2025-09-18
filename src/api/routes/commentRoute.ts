import express from 'express';
import { body } from 'express-validator';
import { validate } from '../../middlewares';
import { commentPost } from '../controllers/commentController';

const router = express.Router();

/**
 * Route:
 * POST /api/v1/comments
 *
 * Validation:
 * - text is required
 * - style and model are optional strings
 * - temperature and max_tokens are optional numeric values (validated later or by model)
 *
 * NOTE: express-validator .escape() is kept on text to avoid accidental HTML injection in logs,
 * but do not over-escape if you want to preserve punctuation/emoji — adjust as you prefer.
 */
router
  .route('/')
  .post(
    body('text').notEmpty().withMessage('text is required').escape(),
    body('style').optional().isString().trim().escape(),
    body('responder.name').optional().isString().trim().escape(),
    body('responder.persona').optional().isString().trim().escape(),
    body('temperature').optional().isFloat({ min: 0, max: 2 }),
    body('max_tokens').optional().isInt({ min: 1, max: 2000 }),
    body('model').optional().isString().trim(),
    validate,
    commentPost
  );

export default router;