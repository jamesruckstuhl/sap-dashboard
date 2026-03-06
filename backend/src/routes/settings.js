'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { db } = require('../db/database');
const { encrypt, decrypt } = require('../services/crypto/cryptoService');
const { rescheduleInstance } = require('../services/scheduler/scheduler');

const router = express.Router();
router.use(authMiddleware);

const emailConfigValidation = [
  body('smtp_host').trim().notEmpty().withMessage('SMTP host is required'),
  body('smtp_port').isInt({ min: 1, max: 65535 }).withMessage('SMTP port must be a valid port number'),
  body('smtp_user').trim().notEmpty().withMessage('SMTP user is required'),
  body('from_address').isEmail().withMessage('from_address must be a valid email'),
  body('alert_emails').isArray().withMessage('alert_emails must be an array'),
  body('alert_emails.*').isEmail().withMessage('Each alert email must be a valid email address'),
  body('report_time')
    .matches(/^\d{2}:\d{2}$/)
    .withMessage('report_time must be in HH:MM format'),
  body('tablespace_pct_threshold')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('tablespace_pct_threshold must be between 0 and 100'),
  body('tablespace_mb_threshold')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('tablespace_mb_threshold must be a positive number'),
  body('report_enabled').optional().isBoolean().withMessage('report_enabled must be a boolean'),
];

// GET /api/settings/:instanceId/email
router.get('/:instanceId/email', async (req, res, next) => {
  const instanceId = parseInt(req.params.instanceId, 10);
  if (isNaN(instanceId)) {
    return res.status(400).json({ error: 'Invalid instance ID' });
  }

  try {
    const config = await db('instance_email_config').where({ instance_id: instanceId }).first();
    if (!config) {
      return res.json({ emailConfig: null });
    }

    // Never return the encrypted password
    const { encrypted_smtp_password, ...safeConfig } = config;
    safeConfig.alert_emails = JSON.parse(safeConfig.alert_emails || '[]');
    safeConfig.has_smtp_password = !!encrypted_smtp_password;

    res.json({ emailConfig: safeConfig });
  } catch (err) {
    next(err);
  }
});

// PUT /api/settings/:instanceId/email
router.put('/:instanceId/email', emailConfigValidation, async (req, res, next) => {
  const instanceId = parseInt(req.params.instanceId, 10);
  if (isNaN(instanceId)) {
    return res.status(400).json({ error: 'Invalid instance ID' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }

  try {
    const {
      smtp_host,
      smtp_port,
      smtp_user,
      smtp_password,
      from_address,
      alert_emails,
      report_time,
      tablespace_pct_threshold,
      tablespace_mb_threshold,
      report_enabled,
    } = req.body;

    const updateData = {
      smtp_host,
      smtp_port: parseInt(smtp_port, 10),
      smtp_user,
      from_address,
      alert_emails: JSON.stringify(alert_emails || []),
      report_time,
      tablespace_pct_threshold: tablespace_pct_threshold !== undefined ? parseFloat(tablespace_pct_threshold) : 85,
      tablespace_mb_threshold: tablespace_mb_threshold !== undefined ? parseFloat(tablespace_mb_threshold) : 500,
      report_enabled: report_enabled !== undefined ? (report_enabled ? 1 : 0) : 1,
    };

    if (smtp_password) {
      const enc = encrypt(smtp_password);
      // Store as JSON so iv and authTag are preserved alongside ciphertext
      updateData.encrypted_smtp_password = JSON.stringify(enc);
    }

    const existing = await db('instance_email_config').where({ instance_id: instanceId }).first();

    if (existing) {
      await db('instance_email_config').where({ instance_id: instanceId }).update(updateData);
    } else {
      await db('instance_email_config').insert({ instance_id: instanceId, ...updateData });
    }

    // Reschedule cron if report settings changed
    rescheduleInstance(instanceId).catch((err) =>
      console.error(`Failed to reschedule instance ${instanceId}:`, err.message)
    );

    const updated = await db('instance_email_config').where({ instance_id: instanceId }).first();
    const { encrypted_smtp_password, ...safeConfig } = updated;
    safeConfig.alert_emails = JSON.parse(safeConfig.alert_emails || '[]');
    safeConfig.has_smtp_password = !!encrypted_smtp_password;

    res.json({ emailConfig: safeConfig });
  } catch (err) {
    next(err);
  }
});

// GET /api/settings (global settings - placeholder for future use)
router.get('/', async (req, res, next) => {
  try {
    res.json({
      settings: {
        sapMockMode: process.env.SAP_MOCK_MODE === 'true',
        nodeEnv: process.env.NODE_ENV || 'development',
        version: '1.0.0',
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
