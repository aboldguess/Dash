/**
 * @fileoverview Tests for administrator configuration endpoints.
 */
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
// Increase test timeout because in-memory MongoDB startup can be slow
jest.setTimeout(20000);
// set secret before importing app
process.env.JWT_SECRET = 'testsecret';
import { app } from '../src/index';
import { connectDB } from '../src/db';
import { User } from '../src/models/user';
import { Team } from '../src/models/team';

let mongo: MongoMemoryServer;
let adminToken: string;

beforeAll(async () => {
  process.env.JWT_SECRET = 'testsecret';
  mongo = await MongoMemoryServer.create();
  process.env.DB_URI = mongo.getUri();
  await connectDB();

  const team = new Team({ name: 'Admins', domains: [], seats: 2 });
  await team.save();

  const hashed = await bcrypt.hash('password', 10);
  const admin = new User({ username: 'admin', password: hashed, role: 'admin', team: team._id });
  await admin.save();

  adminToken = jwt.sign(
    { id: admin.id, username: admin.username, role: admin.role, team: team.id },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

/** Verify config values can be created and listed */
test('admin config endpoints', async () => {
  const create = await request(app)
    .post('/api/admin/config')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ key: 'maintenance', value: 'false' });
  expect(create.status).toBe(200);
  expect(create.body.value).toBe('false');

  const list = await request(app)
    .get('/api/admin/config')
    .set('Authorization', `Bearer ${adminToken}`);
  expect(list.body.find((c: any) => c.key === 'maintenance')).toBeTruthy();
});
