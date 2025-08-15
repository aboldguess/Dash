/**
 * Mini readme: Timesheet routes
 * -----------------------------
 * Exposes endpoints for listing and submitting timesheets. All routes are
 * protected by authentication middleware. The GET handler returns either all
 * timesheets (for admin roles) or only the authenticated user's entries.
 * The POST handler allows admins to submit or update timesheets on behalf of
 * users.
 */
import { Router } from 'express';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/authMiddleware';
import { Timesheet } from '../models/timesheet';

const router = Router();

// All timesheet endpoints require a valid token
router.use(authMiddleware);

// List all timesheets
router.get('/', async (req: AuthRequest, res) => {
  // If authentication middleware failed to attach a user, forbid the request
  if (!req.user) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { id, role } = req.user;

  // Administrators can view all timesheets, everyone else only their own
  const query = role === 'admin' || role === 'teamAdmin'
    ? {}
    : { userId: Number(id) };

  const list = await Timesheet.find(query).exec();

  // Provide simple debug logging to aid troubleshooting
  console.debug('Timesheet query', { user: id, role, criteria: query });

  res.json(list);
});

// Submit or update a timesheet
router.post('/', requireRole(['admin', 'teamAdmin']), async (req, res) => {
  const { id, ...data } = req.body;

  if (id) {
    const updated = await Timesheet.findByIdAndUpdate(id, data, { new: true });
    return res.status(201).json(updated);
  }

  const sheet = new Timesheet(data);
  await sheet.save();
  res.status(201).json(sheet);
});

export default router;
