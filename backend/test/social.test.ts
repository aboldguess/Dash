import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

jest.setTimeout(20000);
import { app } from '../src/index';
import { connectDB } from '../src/db';
import { User } from '../src/models/user';

let mongo: MongoMemoryServer;
let tokenA: string;
let tokenB: string;
let userAId: string;
let userBId: string;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.DB_URI = mongo.getUri();
  await connectDB();

  const hashedA = await bcrypt.hash('a', 10);
  const a = await new User({
    username: 'a',
    password: hashedA,
    role: 'user',
    allowedContacts: [],
    following: [],
    followers: []
  }).save();
  const hashedB = await bcrypt.hash('b', 10);
  const b = await new User({
    username: 'b',
    password: hashedB,
    role: 'user',
    allowedContacts: [],
    following: [],
    followers: []
  }).save();

  userAId = a.id;
  userBId = b.id;
  tokenA = jwt.sign({ id: a.id, username: a.username, role: a.role }, 'secret');
  tokenB = jwt.sign({ id: b.id, username: b.username, role: b.role }, 'secret');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

/** Verify posts can be created and users followed */
test('post creation and follow', async () => {
  const create = await request(app)
    .post('/api/social/posts')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ text: 'hello world' });
  expect(create.status).toBe(201);
  expect(create.body.text).toBe('hello world');

  const list = await request(app)
    .get('/api/social/posts')
    .set('Authorization', `Bearer ${tokenA}`);
  expect(list.body.length).toBe(1);

  const follow = await request(app)
    .post(`/api/social/follow/${userBId}`)
    .set('Authorization', `Bearer ${tokenA}`);
  expect(follow.status).toBe(200);

  const following = await request(app)
    .get(`/api/social/following/${userAId}`)
    .set('Authorization', `Bearer ${tokenA}`);
  expect(following.body[0].username).toBe('b');
});
