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

// Retrieve all work packages for a project
router.get('/:id/workpackages', async (req, res) => {
  const project = await Project.findById(req.params.id).exec();
  if (!project) return res.status(404).json({ message: 'Project not found' });
  res.json(project.workPackages);
});

// Update details for a specific work package
router.patch('/:id/workpackages/:wpId', requireRole(['admin', 'teamAdmin']), async (req, res) => {
  const project = await Project.findById(req.params.id).exec();
  if (!project) return res.status(404).json({ message: 'Project not found' });
  const wp = project.workPackages.id(req.params.wpId);
  if (!wp) return res.status(404).json({ message: 'Work package not found' });
  Object.assign(wp, req.body);
  await project.save();
  res.json(wp);
});

// Retrieve a single work package
router.get('/:id/workpackages/:wpId', async (req, res) => {
  const project = await Project.findById(req.params.id).exec();
  if (!project) return res.status(404).json({ message: 'Project not found' });
  const wp = project.workPackages.id(req.params.wpId);
  if (!wp) return res.status(404).json({ message: 'Work package not found' });
  res.json(wp);
});

// Remove a work package
router.delete('/:id/workpackages/:wpId', requireRole(['admin', 'teamAdmin']), async (req, res) => {
  const project = await Project.findById(req.params.id).exec();
  if (!project) return res.status(404).json({ message: 'Project not found' });
  const wp = project.workPackages.id(req.params.wpId);
  if (!wp) return res.status(404).json({ message: 'Work package not found' });
  wp.deleteOne();
  await project.save();
  res.json({ message: 'Work package removed' });
});

// Update individual tasks within a work package
router.patch('/:id/workpackages/:wpId/tasks/:taskId', requireRole(['admin', 'teamAdmin']), async (req, res) => {
  const project = await Project.findById(req.params.id).exec();
  if (!project) return res.status(404).json({ message: 'Project not found' });
  const wp = project.workPackages.id(req.params.wpId);
  if (!wp) return res.status(404).json({ message: 'Work package not found' });
  const task = wp.tasks.id(req.params.taskId);
  if (!task) return res.status(404).json({ message: 'Task not found' });
  Object.assign(task, req.body);
  await project.save();
  res.json(task);
});

// Retrieve a single task from a work package
router.get('/:id/workpackages/:wpId/tasks/:taskId', async (req, res) => {
  const project = await Project.findById(req.params.id).exec();
  if (!project) return res.status(404).json({ message: 'Project not found' });
  const wp = project.workPackages.id(req.params.wpId);
  if (!wp) return res.status(404).json({ message: 'Work package not found' });
  const task = wp.tasks.id(req.params.taskId);
  if (!task) return res.status(404).json({ message: 'Task not found' });
  res.json(task);
});

// Remove an individual task
router.delete('/:id/workpackages/:wpId/tasks/:taskId', requireRole(['admin', 'teamAdmin']), async (req, res) => {
  const project = await Project.findById(req.params.id).exec();
  if (!project) return res.status(404).json({ message: 'Project not found' });
  const wp = project.workPackages.id(req.params.wpId);
  if (!wp) return res.status(404).json({ message: 'Work package not found' });
  const task = wp.tasks.id(req.params.taskId);
  if (!task) return res.status(404).json({ message: 'Task not found' });
  task.deleteOne();
  await project.save();
  res.json({ message: 'Task removed' });
});

export default router;
