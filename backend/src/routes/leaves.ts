import { Router } from 'express';

const router = Router();

interface Leave {
  id: number;
  userId: number;
  startDate: string;
  endDate: string;
  status: 'pending' | 'approved' | 'rejected';
}

let leaves: Leave[] = [];
let nextId = 1;

// List leaves
router.get('/', (_, res) => {
  res.json(leaves);
});

// Request or update leave
router.post('/', (req, res) => {
  const leave = req.body as Leave;
  if (!leave.id) {
    leave.id = nextId++;
    leave.status = 'pending';
    leaves.push(leave);
  } else {
    leaves = leaves.map(l => (l.id === leave.id ? { ...l, ...leave } : l));
  }
  res.status(201).json(leave);
});

export default router;
