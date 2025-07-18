import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';
import { Timesheet } from '../models/timesheet';

const router = Router();

// All timesheet endpoints require a valid token
router.use(authMiddleware);

// List all timesheets
router.get('/', async (_, res) => {
  const list = await Timesheet.find().exec();
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
