'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const instanceController = require('../controllers/instanceController');
const { connect, disconnect, callRfc } = require('../services/sap/sapConnector');

const router = express.Router();
router.use(authMiddleware);

// GET /api/updates/:instanceId
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

    const result = await callRfc(handle, 'UPDATE_MONITOR_INFO_GET', {});
    const updates = result.ET_UPD_INFO || [];

    res.json({ updates });
  } catch (err) {
    next(err);
  } finally {
    if (handle) await disconnect(handle).catch(() => {});
  }
});

// DELETE /api/updates/:instanceId
router.delete(
  '/:instanceId',
  [
    body('vbkeys')
      .isArray({ min: 1 })
      .withMessage('vbkeys must be a non-empty array'),
    body('vbkeys.*').isString().trim().notEmpty().withMessage('Each vbkey must be a non-empty string'),
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

    let handle;
    try {
      const instance = await instanceController.getInstanceById(instanceId);
      if (!instance) {
        return res.status(404).json({ error: 'Instance not found' });
      }

      const credentials = await instanceController.getDecryptedCredentials(instanceId);
      handle = await connect(instance, credentials);

      const { vbkeys } = req.body;
      const results = [];

      for (const vbkey of vbkeys) {
        try {
          await callRfc(handle, 'VBDELETE', { VBKEY: vbkey });
          results.push({ vbkey, success: true });
        } catch (delErr) {
          results.push({ vbkey, success: false, error: delErr.message });
        }
      }

      const allSuccess = results.every((r) => r.success);
      res.json({
        success: allSuccess,
        results,
        message: allSuccess ? 'All update records deleted' : 'Some records could not be deleted',
      });
    } catch (err) {
      next(err);
    } finally {
      if (handle) await disconnect(handle).catch(() => {});
    }
  }
);

module.exports = router;
