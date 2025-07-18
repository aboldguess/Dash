import { Router } from 'express';
import { Message } from '../models/message';

const router = Router();

// Retrieve all chat messages from the database
router.get('/', async (_, res) => {
  const msgs = await Message.find().exec();
  res.json(msgs);
});

// Store a new chat message
router.post('/', async (req, res) => {
  const { user, text } = req.body;
  const msg = new Message({ user, text });
  await msg.save();
  res.status(201).json(msg);
});

export default router;
