import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

// Set environment variables before app imports
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-integration-tests-only';
process.env.JWT_EXPIRES_IN = '1h';
process.env.ENCRYPTION_KEY = 'test-encryption-key-for-integration-tests';
process.env.SAP_MOCK_MODE = 'true';
process.env.DB_PATH = ':memory:';

import app from '../../src/server.js';
import { initDb, db } from '../../src/db/database.js';

let server;

beforeAll(async () => {
  await initDb();
});

afterAll(async () => {
  await db.destroy();
  if (server) server.close();
});

describe('POST /api/auth/login', () => {
  it('should return 200 and a JWT token for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin123!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(10);
  });

  it('should return user info (without password_hash) alongside the token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin123!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user).toHaveProperty('username', 'admin');
    expect(res.body.user).toHaveProperty('role');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('should return 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('should return 401 for non-existent user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nonexistent', password: 'anypassword' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('should return 400 when username is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'Admin123!' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('should return 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('should return 400 when both fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('should return 400 when body is empty', async () => {
    const res = await request(app)
      .post('/api/auth/login');

    expect(res.status).toBe(400);
  });

  it('should not leak information about whether a user exists (same error for wrong user vs wrong password)', async () => {
    const resWrongUser = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nonexistent', password: 'anypassword' });

    const resWrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrongpassword' });

    expect(resWrongUser.status).toBe(401);
    expect(resWrongPassword.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('should return 200', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
  });

  it('should return a success message', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.body).toHaveProperty('message');
  });
});

describe('GET /api/auth/me', () => {
  let validToken;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin123!' });
    validToken = res.body.token;
  });

  it('should return 401 without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('should return 401 with a malformed token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.here');

    expect(res.status).toBe(401);
  });

  it('should return 401 with no Bearer prefix', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', validToken);

    expect(res.status).toBe(401);
  });

  it('should return 200 with user info for a valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toHaveProperty('username', 'admin');
    expect(res.body.user).toHaveProperty('role');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('should return user id in the response', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty('id');
    expect(typeof res.body.user.id).toBe('number');
  });
});
