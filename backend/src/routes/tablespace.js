'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { db } = require('../db/database');
const instanceController = require('../controllers/instanceController');
const { connect, disconnect, callRfc } = require('../services/sap/sapConnector');
const { sendAlert } = require('../services/email/emailService');
const { runBrtools } = require('../services/brtools/brtoolsService');

const router = express.Router();

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
router.use(authMiddleware);

// GET /api/tablespace/:instanceId
router.get('/:instanceId', async (req, res, next) => {
  const instanceId = parseInt(req.params.instanceId, 10);
  if (isNaN(instanceId)) {
    return res.status(400).json({ error: 'Invalid instance ID' });
  }

  let handle;
  try {
    const instance = await instanceController.getInstanceById(instanceId);
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    const credentials = await instanceController.getDecryptedCredentials(instanceId);
    handle = await connect(instance, credentials);
    const result = await callRfc(handle, 'DB_TABLESPACE_INFO_GET', {});
    const tablespaces = result.ET_TABLESPACE || [];

    // Check thresholds and send alerts if needed
    const emailConfig = await db('instance_email_config').where({ instance_id: instanceId }).first();
    if (emailConfig) {
      const pctThreshold = emailConfig.tablespace_pct_threshold || 85;
      const mbThreshold = emailConfig.tablespace_mb_threshold || 500;
      const alertEmails = JSON.parse(emailConfig.alert_emails || '[]');

      const exceeding = tablespaces.filter(
        (ts) => ts.used_pct >= pctThreshold || ts.free_mb <= mbThreshold
      );

      if (exceeding.length > 0 && alertEmails.length > 0) {
        const rows = exceeding
          .map(
            (ts) =>
              `<tr>
                <td>${escHtml(ts.tablespace)}</td>
                <td>${escHtml(ts.type)}</td>
                <td>${escHtml(ts.total_mb.toFixed(0))} MB</td>
                <td>${escHtml(ts.used_mb.toFixed(0))} MB</td>
                <td>${escHtml(ts.free_mb.toFixed(0))} MB</td>
                <td style="color:red;font-weight:bold">${escHtml(ts.used_pct.toFixed(1))}%</td>
                <td>${escHtml(ts.status)}</td>
              </tr>`
          )
          .join('');

        const htmlBody = `
          <h2>Tablespace Alert - ${instance.name} (${instance.sid})</h2>
          <p>The following tablespaces have exceeded alert thresholds (${pctThreshold}% usage or &lt;${mbThreshold} MB free):</p>
          <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">
            <thead>
              <tr><th>Tablespace</th><th>Type</th><th>Total MB</th><th>Used MB</th><th>Free MB</th><th>Used %</th><th>Status</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p>Please take action to extend or clean up these tablespaces.</p>
        `;

        sendAlert(instance.name, `SAP Tablespace Alert - ${instance.sid}`, htmlBody, alertEmails, instanceId).catch((err) =>
          console.error('Failed to send tablespace alert:', err.message)
        );
      }
    }

    res.json({ tablespaces });
  } catch (err) {
    next(err);
  } finally {
    if (handle) await disconnect(handle).catch(() => {});
  }
});

// POST /api/tablespace/:instanceId/brtools
router.post(
  '/:instanceId/brtools',
  [
    body('tablespace')
      .trim()
      .matches(/^[A-Z0-9_]{1,30}$/)
      .withMessage('Tablespace name must be 1-30 uppercase letters, digits, or underscores'),
    body('sizeGb')
      .isFloat({ gt: 0, max: 100 })
      .withMessage('sizeGb must be a positive number no greater than 100'),
  ],
  async (req, res, next) => {
    const instanceId = parseInt(req.params.instanceId, 10);
    if (isNaN(instanceId)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    try {
      const { tablespace, sizeGb } = req.body;
      const output = await runBrtools(instanceId, tablespace, sizeGb);
      res.json({ output });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
