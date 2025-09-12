import express from 'express';

import commentRoute from './routes/commentRoute';

import {MessageResponse} from '../types/MessageTypes';

const router = express.Router();

router.get<{}, MessageResponse>('/', (_req, res) => {
  res.json({
    message: 'routes: comments',
  });
});

router.use('/comments', commentRoute);

export default router;
