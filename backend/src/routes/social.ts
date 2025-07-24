import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { Post } from '../models/post';
import { Follow } from '../models/follow';
import { User } from '../models/user';

const router = Router();

// Require authentication for all social routes
router.use(authMiddleware);

/**
 * List recent posts. Currently returns all posts regardless of follow
 * relationships for simplicity.
 */
router.get('/posts', async (_req, res) => {
  const posts = await Post.find().sort({ createdAt: -1 }).exec();
  res.json(posts);
});

/**
 * Create a new post authored by the logged in user.
 */
router.post('/posts', async (req: AuthRequest, res) => {
  const content = req.body.content;
  if (!content) {
    return res.status(400).json({ message: 'Content required' });
  }
  const post = new Post({ author: req.user!.username, content });
  await post.save();
  res.status(201).json(post);
});

/**
 * Get the list of usernames the current user is following.
 */
router.get('/follows', async (req: AuthRequest, res) => {
  const records = await Follow.find({ follower: req.user!.username }).exec();
  res.json(records.map(r => r.following));
});

/**
 * Follow another user by username.
 */
router.post('/follow/:user', async (req: AuthRequest, res) => {
  const target = req.params.user;
  if (target === req.user!.username) {
    return res.status(400).json({ message: 'Cannot follow yourself' });
  }
  const exists = await User.findOne({ username: target }).exec();
  if (!exists) {
    return res.status(404).json({ message: 'User not found' });
  }
  await Follow.updateOne(
    { follower: req.user!.username, following: target },
    {},
    { upsert: true }
  );
  res.json({ message: 'Followed' });
});

/**
 * Unfollow a previously followed user.
 */
router.delete('/follow/:user', async (req: AuthRequest, res) => {
  await Follow.deleteOne({
    follower: req.user!.username,
    following: req.params.user
  }).exec();
  res.json({ message: 'Unfollowed' });
});

export default router;
