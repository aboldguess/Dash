import { Router } from 'express';

const router = Router();

// In-memory message list for demonstration
const messages: { user: string; text: string }[] = [];

// Get all messages
router.get('/', (_, res) => {
  res.json(messages);
});

// Post a new message
router.post('/', (req, res) => {
  const { user, text } = req.body;
  messages.push({ user, text });
  res.status(201).json({ message: 'Message sent' });
});

export default router;
