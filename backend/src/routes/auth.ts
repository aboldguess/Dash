import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../models/user';
import { Team } from '../models/team';
import { TeamInvitation } from '../models/teamInvitation';

// Secret key used to sign JWT tokens. In production this should come from
// an environment variable so each deployment can use a unique key.
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

const router = Router();

// Login endpoint. Compares hashed passwords and returns a JWT on success.
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  // Look up the user by username only - passwords are hashed in the DB
  const user = await User.findOne({ username }).exec();
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  // Verify that the provided password matches the stored hash
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  // Build a signed JWT containing the user id and role
  const token = jwt.sign(
    { id: String(user._id), username: user.username, role: user.role, team: user.team ? String(user.team) : undefined },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  res.json({
    id: user._id,
    username: user.username,
    role: user.role,
    token
  });
});

// Sign up endpoint to create a user document
router.post('/signup', async (req, res) => {
  const { username, password, teamId, token } = req.body;

  // Fail if the username already exists
  if (await User.exists({ username })) {
    return res.status(400).json({ message: 'Username already taken' });
  }

  // Hash the password before storing in the database
  const hashed = await bcrypt.hash(password, 10);

  let team;
  // Use invitation token if provided
  if (token) {
    const invite = await TeamInvitation.findOne({ token, email: username }).exec();
    if (!invite) {
      return res.status(400).json({ message: 'Invalid invitation token' });
    }
    team = await Team.findById(invite.team).exec();
    if (!team) {
      return res.status(400).json({ message: 'Invitation team missing' });
    }
    // consume invitation
    await invite.deleteOne();
  } else if (teamId) {
    // Directly specify a team by id
    team = await Team.findById(teamId).exec();
  } else {
    // Fallback to domain based matching
    const parts = username.split('@');
    if (parts.length === 2) {
      team = await Team.findOne({ domains: parts[1] }).exec();
    }
  }

  if (!team) {
    return res.status(400).json({ message: 'Unable to determine team for user' });
  }

  // Enforce license seat limits
  const memberCount = await User.countDocuments({ team: team._id });
  if (memberCount >= team.seats) {
    return res.status(400).json({ message: 'No available seats for this team' });
  }

  const newUser = new User({
    username,
    password: hashed,
    role: 'user',
    team: team._id,
    allowedContacts: []
  });
  await newUser.save();

  res.json({ id: newUser._id, username: newUser.username, role: newUser.role, team: team.name });
});

export default router;
