import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { User } from '../models/user';
import { DirectMessage } from '../models/directMessage';
import { onlineUsers } from '../presence';

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
    online: onlineUsers.has(u.username)
  }));
  res.json(result);
});

/**
 * Retrieve the conversation between the logged in user and another user.
 */
router.get('/conversation/:user', async (req: AuthRequest, res) => {
  const other = req.params.user;
  const current = req.user!.username;

  // Find messages where the current user is either the sender or recipient
  const msgs = await DirectMessage.find({
    $or: [
      { from: current, to: other },
      { from: other, to: current }
    ]
  }).sort({ createdAt: 1 }).exec();

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

export default router;
