import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../models/user';
import { Team } from '../models/team';
import { TeamInvitation } from '../models/teamInvitation';
import { processPayment } from '../payments';

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

// Sign up endpoint to create a user document. The request may optionally
// include a team ID or invitation token to join an existing team. If a
// `teamName` is supplied, a new team will be created on the fly.
router.post('/signup', async (req, res) => {
  // In addition to standard credentials the client may request creation of a
  // new team. `seats` specifies how many licenses to purchase and `plan`
  // represents the pricing tier (unused by the dummy payment handler).
  const { username, password, teamId, token, teamName, seats = 5, plan = 'basic' } = req.body;

  // Fail if the username already exists
  if (await User.exists({ username })) {
    return res.status(400).json({ message: 'Username already taken' });
  }

  // Hash the password before storing in the database
  const hashed = await bcrypt.hash(password, 10);
  // Convert the requested seat count to a number, falling back to 5 which
  // matches the default free tier used in demos.
  const seatCount = parseInt(seats, 10) || 5;

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
  } else if (teamName) {
    // Creating a brand new team requires payment processing. This dummy
    // implementation simply waits then logs the transaction. Replace
    // `processPayment` with a real gateway later.
    await processPayment(username, plan, seatCount);

    // Create the team with the requested number of seats. Domain mapping
    // can be added during onboarding but is omitted here for brevity.
    team = new Team({ name: teamName, domains: [], seats: seatCount });
    await team.save();
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

  // Enforce license seat limits to prevent exceeding paid capacity
  const memberCount = await User.countDocuments({ team: team._id });
  if (memberCount >= team.seats) {
    return res.status(400).json({ message: 'No available seats for this team' });
  }

  const newUser = new User({
    username,
    password: hashed,
    role: 'user',
    team: team._id,
    allowedContacts: [],
    following: [],
    followers: []
  });
  await newUser.save();

  res.json({ id: newUser._id, username: newUser.username, role: newUser.role, team: team.name });
});

export default router;
