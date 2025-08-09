/**
 * @fileoverview Tests for profile API including photo uploads.
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
import fs from 'fs';
import path from 'path';

let mongo: MongoMemoryServer;
let userAToken: string;
let userBToken: string;
let userCToken: string;
let userAId: string;

beforeAll(async () => {
  process.env.JWT_SECRET = 'testsecret';
  mongo = await MongoMemoryServer.create();
  process.env.DB_URI = mongo.getUri();
  await connectDB();

  const hashed = await bcrypt.hash('secret', 10);
  const team1 = await new Team({ name: 'Team1' }).save();
  const team2 = await new Team({ name: 'Team2' }).save();
  const userA = await new User({ username: 'userA@test.com', password: hashed, role: 'user', team: team1.id }).save();
  const userB = await new User({ username: 'userB@test.com', password: hashed, role: 'user', team: team1.id }).save();
  const userC = await new User({ username: 'userC@test.com', password: hashed, role: 'user', team: team2.id }).save();
  userAId = userA.id;
  userAToken = jwt.sign(
    { id: userA.id, username: userA.username, role: userA.role, team: team1.id },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );
  userBToken = jwt.sign(
    { id: userB.id, username: userB.username, role: userB.role, team: team1.id },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );
  userCToken = jwt.sign(
    { id: userC.id, username: userC.username, role: userC.role, team: team2.id },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

/** Verify profile can be created and photo uploaded */
test('profile lifecycle', async () => {
  const update = await request(app)
    .post('/api/profile/me')
    .set('Authorization', `Bearer ${userAToken}`)
    .send({
      career: 'Developer',
      education: 'CS Degree',
      statement: 'Hello',
      careerVisibility: 'world',
      educationVisibility: 'platform',
      statementVisibility: 'team',
      photoVisibility: 'platform'
    });
  expect(update.status).toBe(200);
  expect(update.body.careerVisibility).toBe('world');

  // create a temporary image file to upload
  const tmp = path.join(__dirname, 'temp.png');
  fs.writeFileSync(tmp, 'data');
  const photoRes = await request(app)
    .post('/api/profile/me/photo')
    .set('Authorization', `Bearer ${userAToken}`)
    .field('visibility', 'world')
    .attach('photo', tmp);
  expect(photoRes.status).toBe(200);
  expect(photoRes.body.photo).toContain('/uploads/');
  expect(photoRes.body.photoVisibility).toBe('world');
  fs.unlinkSync(tmp);

  const get = await request(app)
    .get('/api/profile/me')
    .set('Authorization', `Bearer ${userAToken}`);
  expect(get.body.education).toBe('CS Degree');
  expect(get.body.photo).toEqual(photoRes.body.photo);
});

/** Ensure visibility settings control access to fields */
test('visibility filtering', async () => {
  // No token -> only world-visible fields
  const unauth = await request(app).get(`/api/profile/${userAId}`);
  expect(unauth.body.career).toBe('Developer');
  expect(unauth.body.education).toBeUndefined();

  // Same team -> team-visible fields returned
  const sameTeam = await request(app)
    .get(`/api/profile/${userAId}`)
    .set('Authorization', `Bearer ${userBToken}`);
  expect(sameTeam.body.statement).toBe('Hello');

  // Different team -> team fields hidden but platform fields shown
  const diffTeam = await request(app)
    .get(`/api/profile/${userAId}`)
    .set('Authorization', `Bearer ${userCToken}`);
  expect(diffTeam.body.education).toBe('CS Degree');
  expect(diffTeam.body.statement).toBeUndefined();
});
