import { Router } from 'express';

const router = Router();

interface Timesheet {
  id: number;
  userId: number;
  hours: number;
  date: string;
}

let sheets: Timesheet[] = [];
let nextId = 1;

// List all timesheets
router.get('/', (_, res) => {
  res.json(sheets);
});

// Submit or update a timesheet
router.post('/', (req, res) => {
  const sheet = req.body as Timesheet;
  if (!sheet.id) {
    sheet.id = nextId++;
    sheets.push(sheet);
  } else {
    sheets = sheets.map(s => (s.id === sheet.id ? sheet : s));
  }
  res.status(201).json(sheet);
});

export default router;
