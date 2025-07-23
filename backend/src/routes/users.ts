import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { User } from '../models/user';
import { DirectMessage } from '../models/directMessage';
import { isOnline } from '../presence';

/**
 * Determine whether two users may exchange direct messages. Users in the same
 * team are always allowed. Cross-team messages require the recipient to be
 * listed in the sender's allowedContacts array.
 */
async function canMessage(sender: string, recipient: string): Promise<boolean> {
  const [from, to] = await Promise.all([
    User.findOne({ username: sender }).exec(),
    User.findOne({ username: recipient }).exec()
  ]);
  if (!from || !to) return false;
  // Same-team communication is permitted by default
  if (String(from.team) === String(to.team)) return true;
  // Cross-team messages require explicit permission
  return from.allowedContacts.some(id => String(id) === String(to._id));
}

const router = Router();

// Ensure all routes in this file require authentication
router.use(authMiddleware);

/**
 * Get a list of all registered users along with their online status.
 */
router.get('/', async (req: AuthRequest, res) => {
  // Only list members of the same team so workspaces remain isolated
  const teamId = req.user!.team;
  const users = await User.find({ team: teamId }).select('username').exec();
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

  // Ensure the two users are allowed to exchange messages
  if (!(await canMessage(current, other))) {
    return res.status(403).json({ message: 'Messaging not permitted' });
  }

  // Mark messages from the other user as seen once this conversation is opened
  const unseen = await DirectMessage.updateMany(
    { from: other, to: current, isSeen: false },
    { isSeen: true }
  );

  // Retrieve the conversation after updating read state
  const msgs = await DirectMessage.find({
    $or: [
      { from: current, to: other },
      { from: other, to: current }
    ]
  }).sort({ createdAt: 1 }).exec();

  // Inform the reader's other sessions so unread counters stay in sync
  if (unseen.modifiedCount > 0) {
    const io = req.app.get('io');
    io.to(current).emit('messagesSeen', { from: other, count: unseen.modifiedCount });
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

  if (!(await canMessage(current, other))) {
    return res.status(403).json({ message: 'Messaging not permitted' });
  }

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
    { $match: { to: current, isSeen: false } },
    { $group: { _id: '$from', count: { $sum: 1 } } }
  ]).exec();

  const result: Record<string, number> = {};
  counts.forEach(c => {
    result[c._id as string] = c.count as number;
  });

  res.json(result);
});

/**
 * Mark all direct messages from the specified user as seen. This keeps unread
 * counters accurate across a user's sessions.
 */
router.post('/read/:user', async (req: AuthRequest, res) => {
  const other = req.params.user;
  const current = req.user!.username;

  // Update unread messages and keep track of how many changed
  const updated = await DirectMessage.updateMany(
    { from: other, to: current, isSeen: false },
    { isSeen: true }
  );

  // Notify the reader's other sessions so counts remain consistent
  if (updated.modifiedCount > 0) {
    const io = req.app.get('io');
    io.to(current).emit('messagesSeen', { from: other, count: updated.modifiedCount });
  }

  res.json({ count: updated.modifiedCount });
});

/**
 * Allow cross-team direct messages from another user. Only the caller's
 * allowedContacts array is updated so both sides must opt in separately.
 */
router.post('/contacts/:user', async (req: AuthRequest, res) => {
  const current = await User.findById(req.user!.id).exec();
  const other = await User.findOne({ username: req.params.user }).exec();
  if (!current || !other) {
    return res.status(404).json({ message: 'User not found' });
  }
  if (String(current.team) === String(other.team)) {
    return res.status(400).json({ message: 'User already in your team' });
  }
  if (!current.allowedContacts.some(id => String(id) === String(other._id))) {
    current.allowedContacts.push(other._id as any);
    await current.save();
  }
  res.json({ message: 'Contact added' });
});

// Remove a previously allowed contact
router.delete('/contacts/:user', async (req: AuthRequest, res) => {
  const current = await User.findById(req.user!.id).exec();
  const other = await User.findOne({ username: req.params.user }).exec();
  if (!current || !other) {
    return res.status(404).json({ message: 'User not found' });
  }
  current.allowedContacts = current.allowedContacts.filter(id => String(id) !== String(other._id));
  await current.save();
  res.json({ message: 'Contact removed' });
});

export default router;
