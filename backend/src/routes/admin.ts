import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';
import { Config } from '../models/config';
import { Plan } from '../models/plan';

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

/**
 * Manage subscription plans
 */
router.get('/plans', async (_req, res) => {
  const plans = await Plan.find().exec();
  res.json(plans);
});

router.post('/plans', async (req, res) => {
  const { name, maxTeamSize, price, modules } = req.body;
  const plan = new Plan({ name, maxTeamSize, price, modules });
  await plan.save();
  res.status(201).json(plan);
});

router.patch('/plans/:id', async (req, res) => {
  const { name, maxTeamSize, price, modules } = req.body;
  const plan = await Plan.findByIdAndUpdate(
    req.params.id,
    { name, maxTeamSize, price, modules },
    { new: true }
  ).exec();
  if (!plan) {
    return res.status(404).json({ message: 'Plan not found' });
  }
  res.json(plan);
});

router.delete('/plans/:id', async (req, res) => {
  const plan = await Plan.findByIdAndDelete(req.params.id).exec();
  if (!plan) {
    return res.status(404).json({ message: 'Plan not found' });
  }
  res.json({ message: 'Deleted' });
});

export default router;
