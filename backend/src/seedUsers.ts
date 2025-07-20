import bcrypt from 'bcrypt';
import { User } from './models/user';

/**
 * Ensure a set of demo users exist in the database. Each user has the
 * same value for username and password so they are easy to log in with
 * during demos.
 */
export async function seedUsers(): Promise<void> {
  const names = ['jack', 'jill', 'alice', 'bob', 'eve'];
  for (const username of names) {
    // Only create the account if it doesn't already exist
    if (!(await User.exists({ username }))) {
      const hashed = await bcrypt.hash(username, 10);
      const user = new User({ username, password: hashed, role: 'user' });
      await user.save();
    }
  }
}
