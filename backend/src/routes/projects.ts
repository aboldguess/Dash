import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';
import { Project } from '../models/project';

const router = Router();

// All project routes require authentication
router.use(authMiddleware);

// Fetch all projects in the system
router.get('/', async (_, res) => {
  const list = await Project.find().exec();
  res.json(list);
});

// Create a new project or update an existing one
router.post('/', requireRole(['admin', 'teamAdmin']), async (req, res) => {
  const { id, ...data } = req.body;

  if (id) {
    // Update existing project
    const updated = await Project.findByIdAndUpdate(id, data, { new: true });
    return res.status(201).json(updated);
  }

  const project = new Project(data);
  await project.save();
  res.status(201).json(project);
});

export default router;
