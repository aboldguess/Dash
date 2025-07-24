import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { app } from '../src/index';
import { connectDB } from '../src/db';
import { Team } from '../src/models/team';
import { User } from '../src/models/user';

let mongo: MongoMemoryServer;
let adminToken: string;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.DB_URI = mongo.getUri();
  await connectDB();

  const team = new Team({ name: 'Admins', domains: [], seats: 2 });
  await team.save();

  const hashed = await bcrypt.hash('secret', 10);
  const admin = new User({ username: 'admin', password: hashed, role: 'admin', team: team._id });
  await admin.save();
  adminToken = jwt.sign(
    { id: admin.id, username: admin.username, role: admin.role, team: team.id },
    'secret',
    { expiresIn: '1h' }
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

/** Verify contacts can be created, retrieved and deleted */
test('crm contact lifecycle', async () => {
  const create = await request(app)
    .post('/api/crm')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Acme', email: 'contact@example.com', phone: '123' });
  expect(create.status).toBe(201);
  const id = create.body._id;

  const list = await request(app)
    .get('/api/crm')
    .set('Authorization', `Bearer ${adminToken}`);
  expect(list.body.find((c: any) => c._id === id)).toBeTruthy();

  const single = await request(app)
    .get(`/api/crm/${id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(single.body.email).toBe('contact@example.com');

  const update = await request(app)
    .post('/api/crm')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ id, name: 'Acme Updated', email: 'contact@example.com', phone: '456' });
  expect(update.body.name).toBe('Acme Updated');

  const del = await request(app)
    .delete(`/api/crm/${id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(del.status).toBe(200);

  const missing = await request(app)
    .get(`/api/crm/${id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(missing.status).toBe(404);
});
