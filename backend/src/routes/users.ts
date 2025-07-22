import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { User } from '../models/user';
import { DirectMessage } from '../models/directMessage';
import { isOnline } from '../presence';

const router = Router();

// Ensure all routes in this file require authentication
router.use(authMiddleware);

/**
 * Get a list of all registered users along with their online status.
 */
router.get('/', async (_req, res) => {
  const users = await User.find().select('username').exec();
  const result = users.map(u => ({
    username: u.username,
    online: isOnline(u.username)
  }));
  res.json(result);
});

/**
 * Retrieve the conversation between the logged in user and another user.
 */
router.get('/conversation/:user', async (req: AuthRequest, res) => {
  const other = req.params.user;
  const current = req.user!.username;

  // Mark any unread messages from the other user as read before fetching
  const unread = await DirectMessage.updateMany(
    { from: other, to: current, isRead: false },
    { isRead: true }
  );

  // Retrieve the conversation after updating read state
  const msgs = await DirectMessage.find({
    $or: [
      { from: current, to: other },
      { from: other, to: current }
    ]
  }).sort({ createdAt: 1 }).exec();

  // Notify the sender that their messages were read
  if (unread.modifiedCount > 0) {
    const io = req.app.get('io');
    io.to(other).emit('messagesRead', { from: current, count: unread.modifiedCount });
  }

  res.json(msgs);
});

/**
 * Send a direct message to another user.
 */
router.post('/conversation/:user', async (req: AuthRequest, res) => {
  const other = req.params.user;
  const current = req.user!.username;
  const { text } = req.body;

  const msg = new DirectMessage({ from: current, to: other, text });
  await msg.save();

  res.status(201).json(msg);
});

/**
 * Get the count of unread direct messages for the logged in user grouped by sender.
 */
router.get('/unread', async (req: AuthRequest, res) => {
  const current = req.user!.username;

  const counts = await DirectMessage.aggregate([
    { $match: { to: current, isRead: false } },
    { $group: { _id: '$from', count: { $sum: 1 } } }
  ]).exec();

  const result: Record<string, number> = {};
  counts.forEach(c => {
    result[c._id as string] = c.count as number;
  });

  res.json(result);
});

export default router;
