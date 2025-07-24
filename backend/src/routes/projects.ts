import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';
import { Project } from '../models/project';

const router = Router();

// All project routes require authentication
router.use(authMiddleware);

// Fetch all projects
router.get('/', async (_, res) => {
  const list = await Project.find().exec();
  res.json(list);
});

// Retrieve a single project with nested details
router.get('/:id', async (req, res) => {
  const proj = await Project.findById(req.params.id).exec();
  if (!proj) return res.status(404).json({ message: 'Project not found' });
  res.json(proj);
});

// Create or update a project
router.post('/', requireRole(['admin', 'teamAdmin']), async (req, res) => {
  const { id, ...data } = req.body;

  if (id) {
    const updated = await Project.findByIdAndUpdate(id, data, { new: true });
    return res.status(201).json(updated);
  }

  const project = new Project(data);
  await project.save();
  res.status(201).json(project);
});

// Remove a project
router.delete('/:id', requireRole(['admin', 'teamAdmin']), async (req, res) => {
  const del = await Project.findByIdAndDelete(req.params.id).exec();
  if (!del) return res.status(404).json({ message: 'Project not found' });
  res.json({ message: 'Project deleted' });
});

// Add a work package to a project
router.post('/:id/workpackages', requireRole(['admin', 'teamAdmin']), async (req, res) => {
  const project = await Project.findById(req.params.id).exec();
  if (!project) return res.status(404).json({ message: 'Project not found' });
  project.workPackages.push(req.body);
  await project.save();
  res.status(201).json(project);
});

// Add a task to a work package and notify the owner
router.post('/:id/workpackages/:wpId/tasks', requireRole(['admin', 'teamAdmin']), async (req, res) => {
  const project = await Project.findById(req.params.id).exec();
  if (!project) return res.status(404).json({ message: 'Project not found' });
  const wp = project.workPackages.id(req.params.wpId);
  if (!wp) return res.status(404).json({ message: 'Work package not found' });
  wp.tasks.push(req.body);
  await project.save();

  // Notify task owner via direct message channel if socket.io available
  const io = req.app.get('io');
  if (io) {
    io.to(req.body.owner).emit('directMessage', {
      from: 'system',
      to: req.body.owner,
      text: `New task assigned: ${req.body.name}`,
      createdAt: new Date().toISOString(),
      isSeen: false
    });
  }

  res.status(201).json(project);
});

export default router;
