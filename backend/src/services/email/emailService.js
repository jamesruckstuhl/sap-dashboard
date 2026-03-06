'use strict';

const nodemailer = require('nodemailer');
const { db } = require('../../db/database');
const { decrypt } = require('../crypto/cryptoService');

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Builds a nodemailer transporter from an instance's email config.
 */
async function getTransporter(instanceId) {
  const config = await db('instance_email_config').where({ instance_id: instanceId }).first();
  if (!config) {
    throw new Error(`No email configuration found for instance ${instanceId}`);
  }

  let smtpPassword = '';
  if (config.encrypted_smtp_password) {
    try {
      const parsed = JSON.parse(config.encrypted_smtp_password);
      smtpPassword = decrypt(parsed);
    } catch (e) {
      smtpPassword = '';
    }
  }

  return {
    transporter: nodemailer.createTransport({
      host: config.smtp_host,
      port: config.smtp_port || 587,
      secure: config.smtp_port === 465,
      auth: {
        user: config.smtp_user,
        pass: smtpPassword,
      },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
    }),
    fromAddress: config.from_address,
  };
}

/**
 * MED-6: Shared helper — resolves nodemailer transporter from smtpOverride or DB.
 */
async function resolveTransporter(instanceId, smtpOverride) {
  if (smtpOverride) {
    return {
      transporter: nodemailer.createTransport(smtpOverride),
      fromAddress: smtpOverride.from_address || smtpOverride.auth?.user || 'noreply@sap-dashboard.local',
    };
  }
  if (instanceId) {
    return getTransporter(instanceId);
  }
  throw new Error('Either instanceId or smtpOverride must be provided');
}

/**
 * Generates a clean HTML email template.
 */
function buildEmailTemplate(title, headerColor, bodyContent) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
    .wrapper { max-width: 800px; margin: 24px auto; background: #fff; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
    .header { background: ${headerColor}; color: #fff; padding: 20px 28px; }
    .header h1 { margin: 0; font-size: 20px; }
    .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.85; }
    .body { padding: 24px 28px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
    th { background: #f0f0f0; text-align: left; padding: 8px 10px; border: 1px solid #ddd; }
    td { padding: 7px 10px; border: 1px solid #ddd; }
    tr:nth-child(even) td { background: #fafafa; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }
    .badge-red { background: #fee2e2; color: #b91c1c; }
    .badge-yellow { background: #fef3c7; color: #92400e; }
    .footer { padding: 16px 28px; background: #f9f9f9; font-size: 11px; color: #888; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>${escHtml(title)}</h1>
      <p>Generated: ${new Date().toLocaleString()}</p>
    </div>
    <div class="body">
      ${bodyContent}
    </div>
    <div class="footer">
      This message was sent automatically by SAP Monitoring Dashboard. Do not reply to this email.
    </div>
  </div>
</body>
</html>`;
}

/**
 * Sends an alert email to a list of recipients.
 */
async function sendAlert(instanceName, subject, htmlBody, emailList, instanceId = null, smtpOverride = null) {
  if (!emailList || emailList.length === 0) {
    console.warn('sendAlert: no recipients provided, skipping');
    return;
  }

  const { transporter, fromAddress } = await resolveTransporter(instanceId, smtpOverride);
  const fullHtml = buildEmailTemplate(subject, '#dc2626', htmlBody);

  await transporter.sendMail({
    from: `"SAP Dashboard" <${fromAddress}>`,
    to: emailList.join(', '),
    subject,
    html: fullHtml,
  });

  // LOW-3: log recipient count, not addresses (PII)
  console.log(`Alert email sent: "${subject}" to ${emailList.length} recipient(s)`);
}

/**
 * Sends a daily report email with failed jobs.
 * HIGH-4: all SAP-sourced values are HTML-escaped before insertion.
 */
async function sendDailyReport(instanceName, failedJobs, emailList, instanceId = null, smtpOverride = null) {
  if (!emailList || emailList.length === 0) {
    console.warn('sendDailyReport: no recipients provided, skipping');
    return;
  }

  const subject = `SAP Daily Report - ${instanceName} - ${new Date().toLocaleDateString()}`;

  const jobRows = failedJobs.length === 0
    ? '<tr><td colspan="7" style="text-align:center;color:#888;padding:20px">No failed jobs found</td></tr>'
    : failedJobs
        .map(
          (job) => `
          <tr>
            <td>${escHtml(job.jobname)}</td>
            <td>${escHtml(job.jobcount)}</td>
            <td><span class="badge badge-red">${escHtml(job.status || 'ABRT')}</span></td>
            <td>${escHtml(formatSapDate(job.sdlstrtdt))} ${escHtml(formatSapTime(job.sdlstrttm))}</td>
            <td>${escHtml(formatSapDate(job.enddate))} ${escHtml(formatSapTime(job.endtime))}</td>
            <td>${escHtml(job.username)}</td>
            <td>${job.duration != null ? `${escHtml(String(job.duration))}s` : ''}</td>
          </tr>`
        )
        .join('');

  const htmlBody = `
    <h2>Failed Jobs Report</h2>
    <p><strong>Instance:</strong> ${escHtml(instanceName)}</p>
    <p><strong>Report Date:</strong> ${new Date().toLocaleDateString()}</p>
    <p><strong>Total Failed Jobs:</strong> ${failedJobs.length}</p>
    <table>
      <thead>
        <tr>
          <th>Job Name</th>
          <th>Job Count</th>
          <th>Status</th>
          <th>Start Time</th>
          <th>End Time</th>
          <th>User</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        ${jobRows}
      </tbody>
    </table>
  `;

  const { transporter, fromAddress } = await resolveTransporter(instanceId, smtpOverride);
  const fullHtml = buildEmailTemplate(subject, '#1d4ed8', htmlBody);

  await transporter.sendMail({
    from: `"SAP Dashboard" <${fromAddress}>`,
    to: emailList.join(', '),
    subject,
    html: fullHtml,
  });

  // LOW-3: log recipient count, not addresses (PII)
  console.log(`Daily report sent for ${instanceName}: ${failedJobs.length} failed jobs, ${emailList.length} recipient(s)`);
}

function formatSapDate(sapDate) {
  if (!sapDate || sapDate.length !== 8) return sapDate || '';
  return `${sapDate.slice(0, 4)}-${sapDate.slice(4, 6)}-${sapDate.slice(6, 8)}`;
}

function formatSapTime(sapTime) {
  if (!sapTime || sapTime.length < 6) return sapTime || '';
  return `${sapTime.slice(0, 2)}:${sapTime.slice(2, 4)}:${sapTime.slice(4, 6)}`;
}

module.exports = { sendAlert, sendDailyReport, buildEmailTemplate };
