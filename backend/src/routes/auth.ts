import { Router } from 'express';
import { users, User, Role } from '../models/user';

const router = Router();

// Simplistic login endpoint that returns user info if credentials match.
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);

  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  // Typically a JWT would be issued here. Returning user info for demo.
  res.json({ id: user.id, username: user.username, role: user.role });
});

// Sign up endpoint to register a new user in-memory
router.post('/signup', (req, res) => {
  const { username, password } = req.body;

  // Reject sign up if username already exists
  if (users.some(u => u.username === username)) {
    return res.status(400).json({ message: 'Username already taken' });
  }

  // Create a new user object with the next available id
  const newUser: User = {
    id: users.length + 1,
    username,
    password,
    role: 'user'
  };

  // Add to the in-memory list (note: not persisted across restarts)
  users.push(newUser);

  // Return the created user info
  res.json({ id: newUser.id, username: newUser.username, role: newUser.role });
});

export default router;
