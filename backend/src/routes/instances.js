'use strict';

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const instanceController = require('../controllers/instanceController');

const router = express.Router();
router.use(authMiddleware);

const instanceBodyValidation = [
  body('name').trim().notEmpty().withMessage('Instance name is required'),
  body('hostname').trim().notEmpty().withMessage('Hostname is required'),
  body('sysnr').trim().notEmpty().withMessage('System number is required'),
  body('client').trim().notEmpty().withMessage('Client is required'),
  body('sid').trim().notEmpty().withMessage('SID is required'),
  body('sap_user').trim().notEmpty().withMessage('SAP user is required'),
  body('sap_password').notEmpty().withMessage('SAP password is required'),
];

const updateBodyValidation = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('hostname').optional().trim().notEmpty().withMessage('Hostname cannot be empty'),
  body('sysnr').optional().trim().notEmpty().withMessage('System number cannot be empty'),
  body('client').optional().trim().notEmpty().withMessage('Client cannot be empty'),
  body('sid').optional().trim().notEmpty().withMessage('SID cannot be empty'),
];

// GET /api/instances
router.get('/', async (req, res, next) => {
  try {
    const instances = await instanceController.listInstances();
    res.json({ instances });
  } catch (err) {
    next(err);
  }
});

// POST /api/instances
router.post('/', instanceBodyValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const instance = await instanceController.createInstance(req.body);
    instanceController.auditLog(req.user.username, 'CREATE_INSTANCE', instance.id, { name: instance.name }).catch((e) => console.error('Audit log failed:', e.message));

    res.status(201).json({ instance });
  } catch (err) {
    next(err);
  }
});

// GET /api/instances/:id
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }

    const instance = await instanceController.getInstanceById(id);
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    res.json({ instance });
  } catch (err) {
    next(err);
  }
});

// PUT /api/instances/:id
router.put('/:id', updateBodyValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }

    const existing = await instanceController.getInstanceById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    const instance = await instanceController.updateInstance(id, req.body);
    instanceController.auditLog(req.user.username, 'UPDATE_INSTANCE', id, { name: instance.name }).catch((e) => console.error('Audit log failed:', e.message));

    res.json({ instance });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/instances/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }

    const existing = await instanceController.getInstanceById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    await instanceController.deleteInstance(id);
    instanceController.auditLog(req.user.username, 'DELETE_INSTANCE', id, { name: existing.name }).catch((e) => console.error('Audit log failed:', e.message));

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/instances/:id/test-connection
router.post('/:id/test-connection', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }

    const result = await instanceController.testConnection(id);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
