import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../models/user';

// Secret key used to sign JWT tokens. In production this should come from
// an environment variable so each deployment can use a unique key.
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

const router = Router();

// Login endpoint. Compares hashed passwords and returns a JWT on success.
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  // Look up the user by username only - passwords are hashed in the DB
  const user = await User.findOne({ username }).exec();
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  // Verify that the provided password matches the stored hash
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  // Build a signed JWT containing the user id and role
  const token = jwt.sign(
    { id: String(user._id), username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  res.json({
    id: user._id,
    username: user.username,
    role: user.role,
    token
  });
});

// Sign up endpoint to create a user document
router.post('/signup', async (req, res) => {
  const { username, password } = req.body;

  // Fail if the username already exists
  if (await User.exists({ username })) {
    return res.status(400).json({ message: 'Username already taken' });
  }

  // Hash the password before storing in the database
  const hashed = await bcrypt.hash(password, 10);

  const newUser = new User({ username, password: hashed, role: 'user' });
  await newUser.save();

  res.json({ id: newUser._id, username: newUser.username, role: newUser.role });
});

export default router;
