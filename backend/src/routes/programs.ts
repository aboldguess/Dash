import { Router } from 'express';
import { Program } from '../models/program';

const router = Router();

// List programs stored in the database
router.get('/', async (_, res) => {
  const list = await Program.find().exec();
  res.json(list);
});

// Create or update a program
router.post('/', async (req, res) => {
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
