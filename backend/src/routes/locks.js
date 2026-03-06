'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const instanceController = require('../controllers/instanceController');
const { connect, disconnect, callRfc } = require('../services/sap/sapConnector');

const router = express.Router();
router.use(authMiddleware);

// GET /api/locks/:instanceId
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

    const result = await callRfc(handle, 'ENQUEUE_READ', {});
    const locks = result.ET_ENQUEUE || [];

    res.json({ locks });
  } catch (err) {
    next(err);
  } finally {
    if (handle) await disconnect(handle).catch(() => {});
  }
});

// DELETE /api/locks/:instanceId
router.delete(
  '/:instanceId',
  [
    body('locks')
      .isArray({ min: 1 })
      .withMessage('locks must be a non-empty array'),
    body('locks.*.object').trim().notEmpty().withMessage('Each lock must have an object field'),
    body('locks.*.name1').exists().withMessage('Each lock must have a name1 field'),
    body('locks.*.guname').trim().notEmpty().withMessage('Each lock must have a guname field'),
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

      const { locks } = req.body;
      const results = [];

      for (const lock of locks) {
        try {
          await callRfc(handle, 'ENQUEUE_DELETE', {
            OBJECT: lock.object,
            NAME1: lock.name1,
            NAME2: lock.name2 || '',
            GUNAME: lock.guname,
          });
          results.push({ lock, success: true });
        } catch (lockErr) {
          results.push({ lock, success: false, error: lockErr.message });
        }
      }

      const allSuccess = results.every((r) => r.success);
      res.json({
        success: allSuccess,
        deleted: results.filter((r) => r.success).length,
        results,
        message: allSuccess ? 'All locks deleted' : 'Some locks could not be deleted',
      });
    } catch (err) {
      next(err);
    } finally {
      if (handle) await disconnect(handle).catch(() => {});
    }
  }
);

module.exports = router;
