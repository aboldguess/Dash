/**
 * Mini readme: Leave route tests
 * ------------------------------
 * Validates that the `/api/leaves` endpoints support basic create/update
 * operations while restricting access based on user roles.
 *
 * Structure
 * 1. **Setup** - initialize in-memory MongoDB, create sample users, obtain tokens.
 * 2. **CRUD Tests** - admin may create/update and list leaves; regular users
 *    cannot create and see no records.
 * 3. **Teardown** - disconnect from MongoDB and shut down the in-memory server.
 */
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

jest.setTimeout(20000);
process.env.JWT_SECRET = 'testsecret';

import { app } from '../src/index';
import { connectDB } from '../src/db';
import { User } from '../src/models/user';
import { Team } from '../src/models/team';
import { Leave } from '../src/models/leave';

describe('leave routes', () => {
  let mongo: MongoMemoryServer;
  let adminToken: string;
  let userToken: string;
  let regularUser: any;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.DB_URI = mongo.getUri();
    await connectDB();

    const team = await new Team({ name: 'Ops Team' }).save();
    const hashed = await bcrypt.hash('secret', 10);
    const admin = await new User({ username: 'admin@test.com', password: hashed, role: 'admin', team }).save();
    regularUser = await new User({ username: 'user@test.com', password: hashed, role: 'user', team }).save();

    adminToken = jwt.sign(
      { id: admin.id, username: admin.username, role: admin.role, team: team.id },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
    userToken = jwt.sign(
      { id: regularUser.id, username: regularUser.username, role: regularUser.role, team: team.id },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  test('admin can create and update leave', async () => {
    const create = await request(app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: 1, user: regularUser._id, startDate: '2024-02-01', endDate: '2024-02-05', status: 'approved' });
    console.debug('Created leave', create.body);
    expect(create.status).toBe(201);
    expect(create.body).toHaveProperty('_id');

    const update = await request(app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ id: create.body._id, userId: 1, user: regularUser._id, startDate: '2024-02-01', endDate: '2024-02-05', status: 'rejected' });
    console.debug('Updated leave', update.body);
    expect(update.status).toBe(201);
    expect(update.body.status).toBe('rejected');
  });

  test('listing is restricted by role', async () => {
    const adminList = await request(app)
      .get('/api/leaves')
      .set('Authorization', `Bearer ${adminToken}`);
    console.debug('Admin list', adminList.body);
    expect(adminList.status).toBe(200);
    expect(adminList.body.length).toBeGreaterThan(0);

    const userList = await request(app)
      .get('/api/leaves')
      .set('Authorization', `Bearer ${userToken}`);
    console.debug('User list', userList.body);
    expect(userList.status).toBe(200);
    expect(userList.body.length).toBe(0);
  });

  test('regular user cannot create leave', async () => {
    const res = await request(app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ userId: 1, user: regularUser._id, startDate: '2024-03-01', endDate: '2024-03-02', status: 'pending' });
    console.debug('User create attempt', { status: res.status });
    expect(res.status).toBe(403);
  });
});

