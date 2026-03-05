'use strict';

const cron = require('node-cron');
const { db } = require('../../db/database');
const { connect, disconnect, callRfc } = require('../sap/sapConnector');
const { sendDailyReport } = require('../email/emailService');
const instanceController = require('../../controllers/instanceController');

// Map of instanceId -> cron task
const scheduledTasks = new Map();

/**
 * Parses an HH:MM string and returns [minute, hour] for cron expression.
 */
function parseReportTime(timeStr) {
  const [hour, minute] = (timeStr || '06:00').split(':').map(Number);
  const h = isNaN(hour) ? 6 : hour;
  const m = isNaN(minute) ? 0 : minute;
  return [m, h];
}

/**
 * Runs the daily report job for a single instance.
 */
async function runDailyReport(instance, emailConfig) {
  console.log(`[Scheduler] Running daily report for instance: ${instance.name} (${instance.sid})`);

  let handle;
  try {
    const credentials = await instanceController.getDecryptedCredentials(instance.id);
    handle = await connect(instance, credentials);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10).replace(/-/g, '');

    const result = await callRfc(handle, 'BP_JOB_SELECT', {
      JOBSTATUS: 'ABRT',
      FROM_DATE: dateStr,
      TO_DATE: dateStr,
    });

    const failedJobs = result.JOBSELECT_EXPORT || [];
    const alertEmails = JSON.parse(emailConfig.alert_emails || '[]');

    if (alertEmails.length === 0) {
      console.warn(`[Scheduler] No alert emails configured for instance ${instance.name}, skipping report`);
      return;
    }

    await sendDailyReport(instance.name, failedJobs, alertEmails, instance.id);
    console.log(`[Scheduler] Daily report sent for ${instance.name}: ${failedJobs.length} failed jobs`);
  } catch (err) {
    console.error(`[Scheduler] Error running daily report for instance ${instance.name}:`, err.message);
  } finally {
    if (handle) await disconnect(handle).catch(() => {});
  }
}

/**
 * Schedules a daily report cron job for a single instance.
 */
function scheduleInstance(instance, emailConfig) {
  const [minute, hour] = parseReportTime(emailConfig.report_time);
  const cronExpression = `${minute} ${hour} * * *`;

  // Cancel any existing task for this instance
  if (scheduledTasks.has(instance.id)) {
    scheduledTasks.get(instance.id).stop();
    scheduledTasks.delete(instance.id);
  }

  if (!emailConfig.report_enabled) {
    console.log(`[Scheduler] Reports disabled for instance ${instance.name}, skipping schedule`);
    return;
  }

  const task = cron.schedule(cronExpression, () => {
    runDailyReport(instance, emailConfig).catch((err) =>
      console.error(`[Scheduler] Unhandled error in daily report for ${instance.name}:`, err.message)
    );
  });

  scheduledTasks.set(instance.id, task);
  console.log(`[Scheduler] Scheduled daily report for ${instance.name} at ${emailConfig.report_time} (cron: ${cronExpression})`);
}

/**
 * Initializes the scheduler on startup.
 * Reads all instances with email config and schedules their reports.
 */
async function initScheduler() {
  try {
    const configs = await db('instance_email_config').where({ report_enabled: 1 });

    for (const emailConfig of configs) {
      const instance = await instanceController.getInstanceById(emailConfig.instance_id);
      if (instance) {
        scheduleInstance(instance, emailConfig);
      }
    }

    console.log(`[Scheduler] Initialized with ${configs.length} scheduled report(s)`);
  } catch (err) {
    console.error('[Scheduler] Failed to initialize:', err.message);
  }
}

/**
 * Reschedules a single instance's cron job.
 * Called when the instance's email config is updated.
 */
async function rescheduleInstance(instanceId) {
  try {
    const emailConfig = await db('instance_email_config').where({ instance_id: instanceId }).first();
    const instance = await instanceController.getInstanceById(instanceId);

    if (!instance) {
      // Instance was deleted — cancel any scheduled task
      if (scheduledTasks.has(instanceId)) {
        scheduledTasks.get(instanceId).stop();
        scheduledTasks.delete(instanceId);
      }
      return;
    }

    if (!emailConfig) {
      // No email config — cancel any existing task
      if (scheduledTasks.has(instanceId)) {
        scheduledTasks.get(instanceId).stop();
        scheduledTasks.delete(instanceId);
      }
      return;
    }

    scheduleInstance(instance, emailConfig);
  } catch (err) {
    console.error(`[Scheduler] Failed to reschedule instance ${instanceId}:`, err.message);
    throw err;
  }
}

module.exports = { initScheduler, rescheduleInstance };
