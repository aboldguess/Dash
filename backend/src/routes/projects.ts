import { Router } from 'express';

const router = Router();

interface Project {
  id: number;
  name: string;
  description?: string;
  status: 'todo' | 'in-progress' | 'done';
}

let projects: Project[] = [];
let nextId = 1;

// List projects
router.get('/', (_, res) => {
  res.json(projects);
});

// Add or update a project
router.post('/', (req, res) => {
  const project = req.body as Project;
  if (!project.id) {
    project.id = nextId++;
    project.status = 'todo';
    projects.push(project);
  } else {
    projects = projects.map(p => (p.id === project.id ? { ...p, ...project } : p));
  }
  res.status(201).json(project);
});

export default router;
