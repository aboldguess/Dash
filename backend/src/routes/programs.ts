import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';
import { Program } from '../models/program';

const router = Router();

// Protect program management endpoints
router.use(authMiddleware);

// List programs stored in the database
router.get('/', async (_, res) => {
  const list = await Program.find().exec();
  res.json(list);
});

// Create or update a program
router.post('/', requireRole(['admin', 'teamAdmin']), async (req, res) => {
  const { id, ...data } = req.body;

  if (id) {
    const updated = await Program.findByIdAndUpdate(id, data, { new: true });
    return res.status(201).json(updated);
  }

  const program = new Program(data);
  await program.save();
  res.status(201).json(program);
});

export default router;
