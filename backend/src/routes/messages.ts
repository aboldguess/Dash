import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';
import { Message } from '../models/message';

const router = Router();

// Require users to be authenticated to view or send messages
router.use(authMiddleware);

// Retrieve all chat messages from the database
router.get('/', async (_, res) => {
  const msgs = await Message.find().exec();
  res.json(msgs);
});

// Store a new chat message
router.post('/', requireRole(['user', 'teamAdmin', 'admin']), async (req, res) => {
  const { user, text } = req.body;
  const msg = new Message({ user, text });
  await msg.save();
  res.status(201).json(msg);
});

export default router;
