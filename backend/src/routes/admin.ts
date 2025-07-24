import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';
import { Config } from '../models/config';

const router = Router();

// All admin routes require authentication and admin role
router.use(authMiddleware, requireRole(['admin']));

/**
 * Retrieve all configuration key/value pairs.
 */
router.get('/config', async (_req, res) => {
  const list = await Config.find().exec();
  res.json(list);
});

/**
 * Set a configuration value. Existing keys are updated and new
 * keys are created automatically.
 */
router.post('/config', async (req, res) => {
  const { key, value } = req.body;
  if (!key || value === undefined) {
    return res.status(400).json({ message: 'key and value required' });
  }

  const item = await Config.findOneAndUpdate(
    { key },
    { value },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).exec();

  res.json(item);
});

export default router;
