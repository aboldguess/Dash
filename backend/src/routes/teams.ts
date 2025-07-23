import { Router } from 'express';
import { Team } from '../models/team';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/authMiddleware';

const router = Router();

// All team operations require authentication
router.use(authMiddleware);

/**
 * List all teams. Only admins may access this endpoint.
 */
router.get('/', requireRole(['admin']), async (_req, res) => {
  const list = await Team.find().exec();
  res.json(list);
});

/**
 * Create a new team with a name, domain list and seat count.
 */
router.post('/', requireRole(['admin']), async (req: AuthRequest, res) => {
  const { name, domains, seats } = req.body;
  const team = new Team({ name, domains, seats });
  await team.save();
  res.status(201).json(team);
});

export default router;
