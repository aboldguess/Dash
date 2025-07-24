import bcrypt from 'bcrypt';
import { User } from './models/user';
import { Team } from './models/team';

/**
 * Ensure a set of demo users exist in the database. Each user has the
 * same value for username and password so they are easy to log in with
 * during demos.
 */
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

  // Ensure an administrator user exists so the admin panel can be accessed.
  // The username/password are fixed for demo purposes only and should be
  // changed in production deployments.
  if (!(await User.exists({ username: 'admin' }))) {
    const hashed = await bcrypt.hash('Admin12345', 10);
    const adminUser = new User({
      username: 'admin',
      password: hashed,
      role: 'admin',
      team: adminTeam._id,
      allowedContacts: []
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
        allowedContacts: []
      });
      await user.save();
    }
  }
}
