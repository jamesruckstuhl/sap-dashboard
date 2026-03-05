import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

// Set environment variables before app imports
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-instances-integration';
process.env.JWT_EXPIRES_IN = '1h';
process.env.ENCRYPTION_KEY = 'test-encryption-key-for-instances-tests';
process.env.SAP_MOCK_MODE = 'true';
process.env.DB_PATH = ':memory:';

import app from '../../src/server.js';
import { initDb, db } from '../../src/db/database.js';

let authToken;
let createdInstanceId;

beforeAll(async () => {
  await initDb();

  // Log in to get a token
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'Admin123!' });

  expect(loginRes.status).toBe(200);
  authToken = loginRes.body.token;
});

afterAll(async () => {
  await db.destroy();
});

const testInstance = {
  name: 'Test SAP PRD',
  hostname: '192.168.1.100',
  sysnr: '00',
  client: '100',
  sid: 'PRD',
  description: 'Production SAP System',
  brtools_path: '/usr/sap/PRD/SYS/exe/run/brtools',
  sap_user: 'RFCUSER',
  sap_password: 'RfcPassword123!',
  winrm_user: 'DOMAIN\\SAPAdmin',
  winrm_password: 'WinRmPassword456!',
  winrm_port: 5985,
  winrm_use_ssl: false,
};

describe('GET /api/instances', () => {
  it('should return 401 without auth token', async () => {
    const res = await request(app).get('/api/instances');
    expect(res.status).toBe(401);
  });

  it('should return 200 and an array of instances with valid token', async () => {
    const res = await request(app)
      .get('/api/instances')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('instances');
    expect(Array.isArray(res.body.instances)).toBe(true);
  });

  it('should not include credentials in the list response', async () => {
    const res = await request(app)
      .get('/api/instances')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    for (const instance of res.body.instances) {
      expect(instance).not.toHaveProperty('sap_password');
      expect(instance).not.toHaveProperty('winrm_password');
      expect(instance).not.toHaveProperty('encrypted_sap_password');
      expect(instance).not.toHaveProperty('encrypted_winrm_password');
    }
  });
});

describe('POST /api/instances', () => {
  it('should return 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/instances')
      .send(testInstance);

    expect(res.status).toBe(401);
  });

  it('should create a new instance and return 201', async () => {
    const res = await request(app)
      .post('/api/instances')
      .set('Authorization', `Bearer ${authToken}`)
      .send(testInstance);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('instance');
    expect(res.body.instance).toHaveProperty('id');
    expect(res.body.instance.name).toBe(testInstance.name);
    expect(res.body.instance.hostname).toBe(testInstance.hostname);
    expect(res.body.instance.sid).toBe(testInstance.sid);

    createdInstanceId = res.body.instance.id;
  });

  it('should not return passwords in the create response', async () => {
    const res = await request(app)
      .post('/api/instances')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ ...testInstance, name: 'Another Instance', sid: 'QAS' });

    expect(res.status).toBe(201);
    expect(res.body.instance).not.toHaveProperty('sap_password');
    expect(res.body.instance).not.toHaveProperty('encrypted_sap_password');
  });

  it('should return 400 when required fields are missing', async () => {
    const { name, ...withoutName } = testInstance;

    const res = await request(app)
      .post('/api/instances')
      .set('Authorization', `Bearer ${authToken}`)
      .send(withoutName);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('should return 400 when sap_password is missing', async () => {
    const { sap_password, ...withoutPassword } = testInstance;

    const res = await request(app)
      .post('/api/instances')
      .set('Authorization', `Bearer ${authToken}`)
      .send(withoutPassword);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/instances/:id', () => {
  it('should return 401 without auth', async () => {
    const res = await request(app).get(`/api/instances/1`);
    expect(res.status).toBe(401);
  });

  it('should return 200 with instance data for a valid id', async () => {
    expect(createdInstanceId).toBeDefined();

    const res = await request(app)
      .get(`/api/instances/${createdInstanceId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('instance');
    expect(res.body.instance.id).toBe(createdInstanceId);
    expect(res.body.instance.name).toBe(testInstance.name);
    expect(res.body.instance.sid).toBe(testInstance.sid);
    expect(res.body.instance.hostname).toBe(testInstance.hostname);
  });

  it('should not include credentials in the response', async () => {
    const res = await request(app)
      .get(`/api/instances/${createdInstanceId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.instance).not.toHaveProperty('sap_password');
    expect(res.body.instance).not.toHaveProperty('encrypted_sap_password');
    expect(res.body.instance).not.toHaveProperty('winrm_password');
  });

  it('should return 404 for a non-existent instance id', async () => {
    const res = await request(app)
      .get('/api/instances/999999')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(404);
  });

  it('should return 400 for an invalid (non-numeric) id', async () => {
    const res = await request(app)
      .get('/api/instances/not-a-number')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/instances/:id', () => {
  it('should update an instance and return 200', async () => {
    expect(createdInstanceId).toBeDefined();

    const res = await request(app)
      .put(`/api/instances/${createdInstanceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ description: 'Updated description for PRD' });

    expect(res.status).toBe(200);
    expect(res.body.instance.description).toBe('Updated description for PRD');
  });

  it('should return 404 for updating non-existent instance', async () => {
    const res = await request(app)
      .put('/api/instances/999999')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ description: 'Should not work' });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/instances/:id/test-connection', () => {
  it('should return 401 without auth', async () => {
    const res = await request(app).post(`/api/instances/1/test-connection`);
    expect(res.status).toBe(401);
  });

  it('should return 200 with success:true in SAP_MOCK_MODE', async () => {
    expect(createdInstanceId).toBeDefined();

    const res = await request(app)
      .post(`/api/instances/${createdInstanceId}/test-connection`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('message');
  });

  it('should return 404 for non-existent instance', async () => {
    const res = await request(app)
      .post('/api/instances/999999/test-connection')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/instances/:id', () => {
  it('should return 401 without auth', async () => {
    const res = await request(app).delete(`/api/instances/1`);
    expect(res.status).toBe(401);
  });

  it('should delete an instance and return 204', async () => {
    expect(createdInstanceId).toBeDefined();

    const res = await request(app)
      .delete(`/api/instances/${createdInstanceId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('should return 404 when trying to get the deleted instance', async () => {
    const res = await request(app)
      .get(`/api/instances/${createdInstanceId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(404);
  });

  it('should return 404 when trying to delete an already deleted instance', async () => {
    const res = await request(app)
      .delete(`/api/instances/${createdInstanceId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(404);
  });
});
