import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';
import { Leave } from '../models/leave';

const router = Router();

// Require authentication for leave routes
router.use(authMiddleware);

// List leaves
router.get('/', async (_, res) => {
  const list = await Leave.find().exec();
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
