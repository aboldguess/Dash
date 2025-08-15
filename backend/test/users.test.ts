/**
 * @fileoverview Tests for user listing including presence metadata.
 */
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'testsecret';
import { app } from '../src/index';
import { connectDB } from '../src/db';
import { User } from '../src/models/user';
import { Team } from '../src/models/team';

describe('user routes', () => {
  let mongo: MongoMemoryServer;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'testsecret';
    mongo = await MongoMemoryServer.create();
    process.env.DB_URI = mongo.getUri();
    await connectDB();

    const hashed = await bcrypt.hash('secret', 10);
    const team = await new Team({ name: 'Team' }).save();
    const userA = await new User({ username: 'a@test.com', password: hashed, team }).save();
    await new User({ username: 'b@test.com', password: hashed, team }).save();
    token = jwt.sign(
      { id: userA.id, username: userA.username, role: 'user', team: team.id },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  test('list users includes lastSeen', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const other = res.body.find((u: any) => u.username === 'b@test.com');
    expect(other).toBeDefined();
    expect(other).toHaveProperty('lastSeen');
  });
});
