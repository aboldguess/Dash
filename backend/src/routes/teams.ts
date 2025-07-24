import { Router } from 'express';
import crypto from 'crypto';
import { Team } from '../models/team';
import { TeamInvitation } from '../models/teamInvitation';
import { User } from '../models/user';
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
  res.status(201).json(invite);
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
