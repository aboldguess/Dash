import { Router } from 'express';
import { User } from '../models/user';

const router = Router();

// Login endpoint backed by the database. In a real system passwords would be
// hashed and a JWT returned.
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  // Look up the user by credentials. This is simplified for the demo.
  const user = await User.findOne({ username, password }).exec();
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  res.json({ id: user._id, username: user.username, role: user.role });
});

// Sign up endpoint to create a user document
router.post('/signup', async (req, res) => {
  const { username, password } = req.body;

  // Fail if the username already exists
  if (await User.exists({ username })) {
    return res.status(400).json({ message: 'Username already taken' });
  }

  const newUser = new User({ username, password, role: 'user' });
  await newUser.save();

  res.json({ id: newUser._id, username: newUser.username, role: newUser.role });
});

export default router;
