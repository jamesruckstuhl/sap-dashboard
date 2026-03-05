'use strict';

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const instanceController = require('../controllers/instanceController');
const { connect, disconnect, callRfc } = require('../services/sap/sapConnector');

const router = express.Router();
router.use(authMiddleware);

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function formatDateForSap(dateStr) {
  if (!dateStr) return getYesterday();
  return dateStr.replace(/-/g, '').slice(0, 8);
}

// GET /api/jobs/:instanceId
router.get(
  '/:instanceId',
  [
    query('dateFrom').optional().isString(),
    query('dateTo').optional().isString(),
    query('status').optional().isString(),
  ],
  async (req, res, next) => {
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

      const dateFrom = formatDateForSap(req.query.dateFrom);
      const dateTo = formatDateForSap(req.query.dateTo) || dateFrom;
      const status = req.query.status || 'ABRT';

      const result = await callRfc(handle, 'BP_JOB_SELECT', {
        JOBSTATUS: status,
        FROM_DATE: dateFrom,
        TO_DATE: dateTo,
      });

      const jobs = result.JOBSELECT_EXPORT || [];
      res.json({ jobs });
    } catch (err) {
      next(err);
    } finally {
      if (handle) await disconnect(handle).catch(() => {});
    }
  }
);

// POST /api/jobs/:instanceId/rerun
router.post(
  '/:instanceId/rerun',
  [
    body('jobname').trim().notEmpty().withMessage('jobname is required'),
    body('jobcount').trim().notEmpty().withMessage('jobcount is required'),
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

      const { jobname, jobcount } = req.body;

      // Open a new job
      const openResult = await callRfc(handle, 'JOB_OPEN', { JOBNAME: jobname });
      const newJobcount = openResult.JOBCOUNT;

      // Submit the report in the new job context
      await callRfc(handle, 'SUBST_START_REPORT_IN_BATCH', {
        JOBNM: jobname,
        JOBCT: newJobcount,
        ORIG_JOBNAME: jobname,
        ORIG_JOBCNT: jobcount,
      });

      // Close the job to schedule it
      await callRfc(handle, 'JOB_CLOSE', {
        JOBNAME: jobname,
        JOBCOUNT: newJobcount,
        STRTIMMED: 'X',
      });

      res.json({
        success: true,
        message: `Job ${jobname} resubmitted`,
        newJobcount,
      });
    } catch (err) {
      next(err);
    } finally {
      if (handle) await disconnect(handle).catch(() => {});
    }
  }
);

// GET /api/jobs/:instanceId/log
router.get(
  '/:instanceId/log',
  [
    query('jobname').trim().notEmpty().withMessage('jobname query param is required'),
    query('jobcount').trim().notEmpty().withMessage('jobcount query param is required'),
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

      const { jobname, jobcount } = req.query;
      const result = await callRfc(handle, 'RFC_READ_TEXT', {
        JOBNAME: jobname,
        JOBCOUNT: jobcount,
      });

      res.json({ log: result.TEXT || '' });
    } catch (err) {
      next(err);
    } finally {
      if (handle) await disconnect(handle).catch(() => {});
    }
  }
);

module.exports = router;
