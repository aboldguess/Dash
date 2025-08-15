import { Router } from 'express';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/authMiddleware';
import { Message } from '../models/message';

/**
 * Mini readme: Channel message routes
 * ----------------------------------
 * Express router providing authenticated CRUD operations for chat channel
 * messages. Supports paginated retrieval so clients can request recent
 * messages first and load older history on demand.
 */

const router = Router();

// Require users to be authenticated to view or send messages
router.use(authMiddleware);

// Retrieve messages for a specific channel with optional pagination
router.get('/channel/:id', async (req, res) => {
  const { before, limit } = req.query;
  const query: any = { channel: req.params.id };

  if (before) {
    query.createdAt = { $lt: new Date(before as string) };
  }

  // Cap page size to avoid excessive payloads
  const pageSize = Math.min(parseInt(limit as string) || 20, 100);
  const msgs = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(pageSize)
    .exec();
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
