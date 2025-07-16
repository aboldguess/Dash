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

export default router;
