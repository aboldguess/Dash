/**
 * @fileoverview Team and membership routes.
 *
 * Mini-README
 * ------------
 * This router exposes endpoints used by team administrators to manage their
 * workspace:
 * - CRUD operations for teams
 * - Invitation generation and membership listing
 * - Role management and subscription plan selection
 *
 * Structure
 * 1. Import dependencies and instantiate router with auth requirements.
 * 2. Administrative team endpoints (list, create, retrieve, update).
 * 3. Membership management including invitation, role promotion, and plan
 *    selection with dummy payment processing.
 */
import { Router } from 'express';
import crypto from 'crypto';
import { Team } from '../models/team';
import { TeamInvitation } from '../models/teamInvitation';
import { User } from '../models/user';
import { Plan } from '../models/plan';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/authMiddleware';
import { processPayment } from '../payments';

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

/**
 * Retrieve a single team by id.
 */
router.get('/:id', requireRole(['teamAdmin', 'admin']), async (req, res) => {
  const team = await Team.findById(req.params.id).exec();
  if (!team) {
    return res.status(404).json({ message: 'Team not found' });
  }
  res.json(team);
});

/**
 * Update team details such as name, domains or seat count.
 */
router.patch('/:id', requireRole(['teamAdmin', 'admin']), async (req, res) => {
  const { name, domains, seats } = req.body;
  const team = await Team.findByIdAndUpdate(
    req.params.id,
    { name, domains, seats },
    { new: true }
  ).exec();
  if (!team) {
    return res.status(404).json({ message: 'Team not found' });
  }
  res.json(team);
});

/**
 * List all members belonging to a team.
 */
router.get('/:id/members', requireRole(['teamAdmin', 'admin']), async (req, res) => {
  const members = await User.find({ team: req.params.id })
    .select('username role')
    .exec();
  res.json(members);
});

/**
 * Update a member's role within the team. Ensures at least one admin remains.
 */
router.patch('/:id/members/:userId/role', requireRole(['teamAdmin', 'admin']), async (req: AuthRequest, res) => {
  const { role } = req.body;
  const teamId = req.params.id;
  if (!['user', 'teamAdmin'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  if (req.user!.role === 'teamAdmin' && String(req.user!.team) !== teamId) {
    return res.status(403).json({ message: 'Cannot modify another team' });
  }

  const member = await User.findOne({ _id: req.params.userId, team: teamId }).exec();
  if (!member) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (member.role === 'teamAdmin' && role === 'user') {
    const count = await User.countDocuments({ team: teamId, role: 'teamAdmin', _id: { $ne: member._id } });
    if (count === 0) {
      return res.status(400).json({ message: 'Team must have at least one admin' });
    }
  }

  member.role = role;
  await member.save();
  res.json({ id: member._id, role: member.role });
});

/**
 * Assign a subscription plan to the team. Payment processing is simulated.
 */
router.patch('/:id/plan', requireRole(['teamAdmin', 'admin']), async (req: AuthRequest, res) => {
  const teamId = req.params.id;
  const { planId } = req.body;

  if (req.user!.role === 'teamAdmin' && String(req.user!.team) !== teamId) {
    return res.status(403).json({ message: 'Cannot modify another team' });
  }

  const [team, plan] = await Promise.all([
    Team.findById(teamId).exec(),
    Plan.findById(planId).exec()
  ]);

  if (!team || !plan) {
    return res.status(404).json({ message: 'Team or plan not found' });
  }

  if (team.seats > plan.maxTeamSize) {
    return res.status(400).json({ message: 'Team exceeds selected plan size' });
  }

  await processPayment(req.user!.username, plan.name, plan.maxTeamSize);

  team.plan = plan._id;
  team.seats = plan.maxTeamSize;
  await team.save();

  res.json({ message: 'Plan updated', plan: plan.name });
});

/**
 * Create an invitation for a new member to join the team.
 */
router.post('/:id/invites', requireRole(['teamAdmin', 'admin']), async (req, res) => {
  const { email } = req.body;
  const team = await Team.findById(req.params.id).exec();
  if (!team) {
    return res.status(404).json({ message: 'Team not found' });
  }

  // Ensure the team has seats available when considering existing invitations
  const memberCount = await User.countDocuments({ team: team._id });
  const inviteCount = await TeamInvitation.countDocuments({ team: team._id });
  if (memberCount + inviteCount >= team.seats) {
    return res.status(400).json({ message: 'No available seats for this team' });
  }

  const token = crypto.randomBytes(16).toString('hex');
  const invite = new TeamInvitation({ email, team: team._id, token });
  await invite.save();
  const signupUrl = `${process.env.APP_BASE_URL || ''}/signup?token=${token}`;
  res.status(201).json({ ...invite.toObject(), signupUrl });
});

/**
 * List all pending invitations for the team.
 */
router.get('/:id/invites', requireRole(['teamAdmin', 'admin']), async (req, res) => {
  const invites = await TeamInvitation.find({ team: req.params.id }).exec();
  res.json(invites);
});

/**
 * Revoke a pending invitation by its token.
 */
router.delete('/invites/:token', requireRole(['teamAdmin', 'admin']), async (req, res) => {
  const invite = await TeamInvitation.findOneAndDelete({ token: req.params.token }).exec();
  if (!invite) {
    return res.status(404).json({ message: 'Invite not found' });
  }
  res.json({ message: 'Deleted' });
});

export default router;
