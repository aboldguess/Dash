import { Router } from 'express';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/authMiddleware';
import { Message } from '../models/message';

const router = Router();

// Require users to be authenticated to view or send messages
router.use(authMiddleware);

// Retrieve all chat messages from the database
// Return messages for a specific channel
router.get('/channel/:id', async (req, res) => {
  const msgs = await Message.find({ channel: req.params.id }).exec();
  res.json(msgs);
});

// Retrieve all chat messages (across all channels)
router.get('/', async (_, res) => {
  const msgs = await Message.find().exec();
  res.json(msgs);
});

// Store a new chat message
router.post('/', requireRole(['user', 'teamAdmin', 'admin']), async (req: AuthRequest, res) => {
  const { text, channel } = req.body;
  // The user field is taken from the authenticated request
  const user = req.user!.username;
  const msg = new Message({ user, text, channel });
  await msg.save();
  res.status(201).json(msg);
});

// Edit an existing message's text
router.put('/:id', requireRole(['user', 'teamAdmin', 'admin']), async (req: AuthRequest, res) => {
  const id = req.params.id;
  const msg = await Message.findById(id);

  if (!msg) {
    return res.status(404).json({ message: 'Message not found' });
  }

  // Only the original author or admins may edit
  if (msg.user !== req.user!.username && req.user!.role === 'user') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  msg.text = req.body.text;
  await msg.save();
  res.json(msg);
});

// Delete a message
router.delete('/:id', requireRole(['user', 'teamAdmin', 'admin']), async (req: AuthRequest, res) => {
  const id = req.params.id;
  const msg = await Message.findById(id);

  if (!msg) {
    return res.status(404).json({ message: 'Message not found' });
  }

  if (msg.user !== req.user!.username && req.user!.role === 'user') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  await msg.deleteOne();
  res.json({ message: 'Deleted' });
});

export default router;
