/**
 * @fileoverview Tests for team management endpoints.
 */
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
// Increase test timeout for DB initialisation
jest.setTimeout(20000);
process.env.JWT_SECRET = 'testsecret';
import { app } from '../src/index';
import { connectDB } from '../src/db';
import { Team } from '../src/models/team';
import { User } from '../src/models/user';

let mongo: MongoMemoryServer;
let adminToken: string;
let adminTeam: string;

beforeAll(async () => {
  process.env.JWT_SECRET = 'testsecret';
  mongo = await MongoMemoryServer.create();
  process.env.DB_URI = mongo.getUri();
  await connectDB();

  const team = new Team({ name: 'Admins', domains: [], seats: 5 });
  await team.save();
  adminTeam = team.id;

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

test('create team', async () => {
  const res = await request(app)
    .post('/api/teams')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Team1', domains: ['example.com'], seats: 2 });

  expect(res.status).toBe(201);
  expect(res.body.name).toBe('Team1');
});

test('invite lifecycle', async () => {
  const inviteRes = await request(app)
    .post(`/api/teams/${adminTeam}/invites`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ email: 'user@example.com' });
  expect(inviteRes.status).toBe(201);
  const token = inviteRes.body.token;

  const listRes = await request(app)
    .get(`/api/teams/${adminTeam}/invites`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(listRes.body.length).toBe(1);

  const delRes = await request(app)
    .delete(`/api/teams/invites/${token}`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(delRes.status).toBe(200);
});

test('list members', async () => {
  const hashed = await bcrypt.hash('secret', 10);
  const user = new User({ username: 'member', password: hashed, role: 'user', team: adminTeam });
  await user.save();

  const res = await request(app)
    .get(`/api/teams/${adminTeam}/members`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.body.find((m: any) => m.username === 'member')).toBeTruthy();
});
