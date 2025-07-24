import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { SocialPost } from '../models/socialPost';
import { User } from '../models/user';

const router = Router();

// Require authentication for all social endpoints
router.use(authMiddleware);

/**
 * Retrieve the latest social posts in reverse chronological order.
 */
router.get('/posts', async (_req, res) => {
  const posts = await SocialPost.find()
    .sort({ createdAt: -1 })
    .populate('author', 'username')
    .exec();
  res.json(posts);
});

/**
 * Create a new status post by the logged in user.
 */
router.post('/posts', async (req: AuthRequest, res) => {
  const text = req.body.text;
  if (!text) {
    return res.status(400).json({ message: 'Text required' });
  }
  const post = new SocialPost({ author: req.user!.id, text });
  await post.save();
  const populated = await post.populate('author', 'username');
  res.status(201).json(populated);
});

/**
 * Follow another user by their id.
 */
router.post('/follow/:id', async (req: AuthRequest, res) => {
  const targetId = req.params.id;
  if (targetId === req.user!.id) {
    return res.status(400).json({ message: 'Cannot follow yourself' });
  }
  const [current, target] = await Promise.all([
    User.findById(req.user!.id).exec(),
    User.findById(targetId).exec()
  ]);
  if (!current || !target) {
    return res.status(404).json({ message: 'User not found' });
  }
  if (!current.following.some(id => String(id) === targetId)) {
    current.following.push(target._id as any);
    await current.save();
  }
  if (!target.followers.some(id => String(id) === String(current._id))) {
    target.followers.push(current._id as any);
    await target.save();
  }
  res.json({ message: 'Followed' });
});

/**
 * Unfollow a previously followed user.
 */
router.delete('/follow/:id', async (req: AuthRequest, res) => {
  const targetId = req.params.id;
  const [current, target] = await Promise.all([
    User.findById(req.user!.id).exec(),
    User.findById(targetId).exec()
  ]);
  if (!current || !target) {
    return res.status(404).json({ message: 'User not found' });
  }
  current.following = current.following.filter(id => String(id) !== targetId);
  target.followers = target.followers.filter(id => String(id) !== String(current._id));
  await Promise.all([current.save(), target.save()]);
  res.json({ message: 'Unfollowed' });
});

/**
 * Get the list of users the specified account is following.
 */
router.get('/following/:id', async (req, res) => {
  const user = await User.findById(req.params.id)
    .populate('following', 'username')
    .exec();
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user.following);
});

/**
 * Get the followers of the specified user.
 */
router.get('/followers/:id', async (req, res) => {
  const user = await User.findById(req.params.id)
    .populate('followers', 'username')
    .exec();
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user.followers);
});

export default router;
