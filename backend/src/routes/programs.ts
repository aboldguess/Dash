import { Router } from 'express';

const router = Router();

interface Program {
  id: number;
  name: string;
  owner: string;
}

let programs: Program[] = [];
let nextId = 1;

// List programs
router.get('/', (_, res) => {
  res.json(programs);
});

// Add or update a program
router.post('/', (req, res) => {
  const program = req.body as Program;
  if (!program.id) {
    program.id = nextId++;
    programs.push(program);
  } else {
    programs = programs.map(p => (p.id === program.id ? program : p));
  }
  res.status(201).json(program);
});

export default router;
