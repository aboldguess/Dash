/**
 * @fileoverview Database seeding utilities.
 *
 * Populates the database with demo users and teams for local development.
 * An administrator account is only created when `ADMIN_USERNAME` and
 * `ADMIN_PASSWORD` environment variables are provided, avoiding predictable
 * default credentials in production.
 */
import bcrypt from 'bcrypt';
import { User } from './models/user';
import { Team } from './models/team';

export async function seedUsers(): Promise<void> {
  // Create demo teams if needed
  const [teamA, teamB] = await Promise.all([
    Team.findOneAndUpdate(
      { name: 'TeamA' },
      { name: 'TeamA', domains: ['example.com'], seats: 10 },
      { upsert: true, new: true }
    ),
    Team.findOneAndUpdate(
      { name: 'TeamB' },
      { name: 'TeamB', domains: ['example.org'], seats: 10 },
      { upsert: true, new: true }
    )
  ]);

  // Create the default admin team used for the seeded admin account. This team
  // has no domain restrictions and a single license seat since it is only
  // intended for the administrator user.
  const adminTeam = await Team.findOneAndUpdate(
    { name: 'Admins' },
    { name: 'Admins', domains: [], seats: 1 },
    { upsert: true, new: true }
  );

  // Optionally create an administrator user if credentials are provided via
  // environment variables. This avoids shipping with a hard-coded admin login.
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminUsername && adminPassword && !(await User.exists({ username: adminUsername }))) {
    const hashed = await bcrypt.hash(adminPassword, 10);
    const adminUser = new User({
      username: adminUsername,
      password: hashed,
      role: 'admin',
      team: adminTeam._id,
      allowedContacts: [],
      following: [],
      followers: []
    });
    await adminUser.save();
  }

  const names = ['jack', 'jill', 'alice', 'bob', 'eve'];
  for (const username of names) {
    // Only create the account if it doesn't already exist
    if (!(await User.exists({ username }))) {
      const hashed = await bcrypt.hash(username, 10);
      const team = username === 'alice' || username === 'bob' || username === 'eve' ? teamB : teamA;
      const user = new User({
        username,
        password: hashed,
        role: 'user',
        team: team._id,
        allowedContacts: [],
        following: [],
        followers: []
      });
      await user.save();
    }
  }
}
