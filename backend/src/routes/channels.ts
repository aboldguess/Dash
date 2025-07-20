import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';
import { Channel } from '../models/channel';

const router = Router();

// Require authentication on all channel routes
router.use(authMiddleware);

// Return all channels
router.get('/', async (_, res) => {
  const list = await Channel.find().exec();
  res.json(list);
});

// Create a new channel
router.post('/', requireRole(['user', 'teamAdmin', 'admin']), async (req, res) => {
  const { name } = req.body;
  const channel = new Channel({ name });
  await channel.save();
  res.status(201).json(channel);
});

export default router;
