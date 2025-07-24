import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

jest.setTimeout(20000);
import { app } from '../src/index';
import { connectDB } from '../src/db';
import { User } from '../src/models/user';
import fs from 'fs';
import path from 'path';

let mongo: MongoMemoryServer;
let userToken: string;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.DB_URI = mongo.getUri();
  await connectDB();

  const hashed = await bcrypt.hash('secret', 10);
  const user = new User({ username: 'user@test.com', password: hashed, role: 'user' });
  await user.save();
  userToken = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    'secret',
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
    .set('Authorization', `Bearer ${userToken}`)
    .send({ career: 'Developer', education: 'CS Degree', statement: 'Hello' });
  expect(update.status).toBe(200);
  expect(update.body.career).toBe('Developer');

  // create a temporary file to upload
  const tmp = path.join(__dirname, 'temp.txt');
  fs.writeFileSync(tmp, 'data');
  const photoRes = await request(app)
    .post('/api/profile/me/photo')
    .set('Authorization', `Bearer ${userToken}`)
    .attach('photo', tmp);
  expect(photoRes.status).toBe(200);
  expect(photoRes.body.photo).toContain('/uploads/');
  fs.unlinkSync(tmp);

  const get = await request(app)
    .get('/api/profile/me')
    .set('Authorization', `Bearer ${userToken}`);
  expect(get.body.education).toBe('CS Degree');
  expect(get.body.photo).toEqual(photoRes.body.photo);
});
