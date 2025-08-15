/**
 * Mini readme: Leave routes
 * ------------------------
 * Provides endpoints for listing and managing leave requests. All routes
 * enforce authentication through the shared auth middleware. The GET handler
 * returns either all leave entries (for administrators and team admins) or
 * only the authenticated user's records.
 */
import { Router } from 'express';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/authMiddleware';
import { Leave } from '../models/leave';

const router = Router();

// Require authentication for leave routes
router.use(authMiddleware);

// List leaves
router.get('/', async (req: AuthRequest, res) => {
  // If authentication failed to populate a user object, forbid the request
  if (!req.user) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { id, role } = req.user;

  // Administrators and team admins can view all leaves; other users only their own
  const query = role === 'admin' || role === 'teamAdmin'
    ? {}
    : { userId: Number(id) };

  const list = await Leave.find(query).exec();

  // Debug logging aids troubleshooting while keeping production output minimal
  console.debug('Leave query', { user: id, role, criteria: query });

  res.json(list);
});

// Request or update leave
router.post('/', requireRole(['admin', 'teamAdmin']), async (req, res) => {
  const { id, ...data } = req.body;

  if (id) {
    const updated = await Leave.findByIdAndUpdate(id, data, { new: true });
    return res.status(201).json(updated);
  }

  const leave = new Leave(data);
  await leave.save();
  res.status(201).json(leave);
});

export default router;
