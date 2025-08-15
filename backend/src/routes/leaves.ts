/**
 * @file Leave routes.
 *
 * Purpose
 * -------
 * REST endpoints for listing and managing leave requests.
 *
 * Structure
 * ---------
 * - Initialise an Express router.
 * - Apply authentication middleware globally.
 * - `GET /`: list leave records (admins see all, others only their own).
 * - `POST /`: validate payload then create or update a leave entry.
 *
 * Key Interactions
 * ----------------
 * - Uses the `Leave` Mongoose model for data persistence.
 * - Leverages `authMiddleware` and `requireRole` for JWT validation and role enforcement.
 *
 * Assumptions
 * -----------
 * - `JWT_SECRET` environment variable exists for token verification.
 * - `DB_URI` environment variable supplies MongoDB connection details.
 */
import { Router, Response } from 'express';
// express-validator enables declarative validation of incoming requests
import { check, validationResult } from 'express-validator';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/authMiddleware';
import { Leave } from '../models/leave';

const router = Router();

// Require authentication for leave routes
router.use(authMiddleware);

// List leaves
router.get('/', async (req: AuthRequest, res: Response) => {
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
router.post(
  '/',
  requireRole(['admin', 'teamAdmin']),
  [
    // Validate required leave fields
    check('userId').isNumeric().withMessage('userId must be numeric'),
    check('startDate').isISO8601().withMessage('startDate must be a valid ISO 8601 date'),
    check('endDate').isISO8601().withMessage('endDate must be a valid ISO 8601 date'),
    check('status')
      .optional()
      .isIn(['pending', 'approved', 'rejected'])
      .withMessage('status must be pending, approved, or rejected'),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Output validation details for easier debugging
      console.debug('Leave validation errors', { errors: errors.array() });
      return res.status(400).json({ errors: errors.array() });
    }

    const { id, ...data } = req.body;

    if (id) {
      const updated = await Leave.findByIdAndUpdate(id, data, { new: true });
      return res.status(201).json(updated);
    }

    const leave = new Leave(data);
    await leave.save();
    res.status(201).json(leave);
  }
);

export default router;
