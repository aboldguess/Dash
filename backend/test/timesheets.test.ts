/**
 * Mini readme: Timesheet route tests
 * ---------------------------------
 * Ensures the `/api/timesheets` endpoints enforce role-based access and
 * handle basic create and update operations.
 *
 * Structure
 * 1. **Setup** - spin up in-memory MongoDB, seed users and obtain JWT tokens.
 * 2. **CRUD Tests** - verify admin can create/update, users are restricted,
 *    and listing honours roles.
 * 3. **Teardown** - close database connections and stop the in-memory server.
 */
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Increase test timeout as starting MongoDB can take time
jest.setTimeout(20000);
process.env.JWT_SECRET = 'testsecret';

import { app } from '../src/index';
import { connectDB } from '../src/db';
import { User } from '../src/models/user';
import { Team } from '../src/models/team';
import { Timesheet } from '../src/models/timesheet';
import { Project } from '../src/models/project';

describe('timesheet routes', () => {
  let mongo: MongoMemoryServer;
  let adminToken: string;
  let userToken: string;
  let regularUser: any;
  let project: any;

  beforeAll(async () => {
    // Boot an in-memory MongoDB instance and connect Mongoose to it
    mongo = await MongoMemoryServer.create();
    process.env.DB_URI = mongo.getUri();
    await connectDB();

    // Seed a team and two users: one admin and one regular user
    const team = await new Team({ name: 'Dev Team' }).save();
    const hashed = await bcrypt.hash('secret', 10);
    const admin = await new User({ username: 'admin@test.com', password: hashed, role: 'admin', team }).save();
    regularUser = await new User({ username: 'user@test.com', password: hashed, role: 'user', team }).save();

    // Create a sample project to reference in timesheets
    project = await new Project({
      name: 'Alpha',
      owner: 'admin@test.com',
      billable: true,
      team: team._id
    }).save();

    // Generate JWTs for both users
    adminToken = jwt.sign(
      { id: 99, username: admin.username, role: admin.role, team: team.id },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
    userToken = jwt.sign(
      { id: 1, username: regularUser.username, role: regularUser.role, team: team.id },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  test('admin can create and update a timesheet', async () => {
    const create = await request(app)
      .post('/api/timesheets')
      .set('Authorization', `Bearer ${adminToken}`)
      // Include both userId for route validation and user ObjectId for the model
      .send({ userId: 1, user: regularUser._id, project: project._id, hours: 8, date: '2024-01-01' });
    console.debug('Created timesheet', create.body);
    expect(create.status).toBe(201);
    expect(create.body).toHaveProperty('_id');

    const update = await request(app)
      .post('/api/timesheets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ id: create.body._id, userId: 1, user: regularUser._id, project: project._id, hours: 6, date: '2024-01-01' });
    console.debug('Updated timesheet', update.body);
    expect(update.status).toBe(201);
    expect(update.body.hours).toBe(6);
  });

  test('listing honours role restrictions', async () => {
    const adminList = await request(app)
      .get('/api/timesheets')
      .set('Authorization', `Bearer ${adminToken}`);
    console.debug('Admin list', adminList.body);
    expect(adminList.status).toBe(200);
    expect(adminList.body.length).toBeGreaterThan(0);

    const userList = await request(app)
      .get('/api/timesheets')
      .set('Authorization', `Bearer ${userToken}`);
    console.debug('User list', userList.body);
    expect(userList.status).toBe(200);
    // Regular users should only see their own timesheets
    expect(userList.body.length).toBe(1);
  });

  test('regular user can create a timesheet for themselves', async () => {
    const res = await request(app)
      .post('/api/timesheets')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ userId: 1, user: regularUser._id, project: project._id, hours: 5, date: '2024-01-02' });
    console.debug('User create attempt', { status: res.status });
    expect(res.status).toBe(201);
  });
});

