/**
 * @file Timesheet routes.
 *
 * Purpose
 * -------
 * REST endpoints for listing and submitting timesheet records.
 *
 * Structure
 * ---------
 * - Initialise an Express router.
 * - Apply authentication middleware to all routes.
 * - `GET /`: list timesheets (admins see all, others only their own).
 * - `POST /`: validate payload then create or update a record.
 *
 * Key Interactions
 * ----------------
 * - Uses the `Timesheet` Mongoose model for database access.
 * - Relies on `authMiddleware` and `requireRole` for JWT validation and role checks.
 *
 * Assumptions
 * -----------
 * - `JWT_SECRET` environment variable is set for token verification.
 * - `DB_URI` environment variable provides connectivity to MongoDB.
 */
import { Router, Response } from 'express';
// express-validator provides declarative request validation helpers
import { check, validationResult } from 'express-validator';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/authMiddleware';
import { Timesheet } from '../models/timesheet';

const router = Router();

// All timesheet endpoints require a valid token
router.use(authMiddleware);

// List all timesheets
router.get('/', async (req: AuthRequest, res: Response) => {
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
router.post(
  '/',
  requireRole(['admin', 'teamAdmin']),
  [
    // Validate essential fields before processing the request
    check('userId').isNumeric().withMessage('userId must be numeric'),
    check('hours').isFloat({ gt: 0 }).withMessage('hours must be a positive number'),
    check('date').isISO8601().withMessage('date must be a valid ISO 8601 date'),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Log validation issues to aid debugging
      console.debug('Timesheet validation errors', { errors: errors.array() });
      return res.status(400).json({ errors: errors.array() });
    }

    const { id, ...data } = req.body;

    if (id) {
      const updated = await Timesheet.findByIdAndUpdate(id, data, { new: true });
      return res.status(201).json(updated);
    }

    const sheet = new Timesheet(data);
    await sheet.save();
    res.status(201).json(sheet);
  }
);

export default router;
