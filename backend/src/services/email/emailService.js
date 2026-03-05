'use strict';

const nodemailer = require('nodemailer');
const { db } = require('../../db/database');
const { decrypt } = require('../crypto/cryptoService');

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
    // The IV and auth_tag are stored in the instance_credentials for credentials;
    // for email, we encode them inline in the encrypted field as JSON
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
 * Generates a clean HTML email template.
 */
function buildEmailTemplate(title, headerColor, bodyContent) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
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
      <h1>${title}</h1>
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
 *
 * @param {string} instanceName
 * @param {string} subject
 * @param {string} htmlBody - preformatted HTML body content
 * @param {string[]} emailList
 * @param {number} [instanceId] - if provided, loads SMTP config from DB
 * @param {object} [smtpOverride] - if provided, uses this SMTP config directly
 */
async function sendAlert(instanceName, subject, htmlBody, emailList, instanceId = null, smtpOverride = null) {
  if (!emailList || emailList.length === 0) {
    console.warn('sendAlert: no recipients provided, skipping');
    return;
  }

  let transporter;
  let fromAddress;

  if (smtpOverride) {
    transporter = nodemailer.createTransport(smtpOverride);
    fromAddress = smtpOverride.from_address || smtpOverride.auth?.user || 'noreply@sap-dashboard.local';
  } else if (instanceId) {
    const result = await getTransporter(instanceId);
    transporter = result.transporter;
    fromAddress = result.fromAddress;
  } else {
    throw new Error('Either instanceId or smtpOverride must be provided to sendAlert');
  }

  const fullHtml = buildEmailTemplate(subject, '#dc2626', htmlBody);

  await transporter.sendMail({
    from: `"SAP Dashboard" <${fromAddress}>`,
    to: emailList.join(', '),
    subject,
    html: fullHtml,
  });

  console.log(`Alert email sent: "${subject}" to ${emailList.join(', ')}`);
}

/**
 * Sends a daily report email with failed jobs.
 *
 * @param {string} instanceName
 * @param {object[]} failedJobs - array of job objects from BP_JOB_SELECT
 * @param {string[]} emailList
 * @param {number} [instanceId]
 * @param {object} [smtpOverride]
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
            <td>${job.jobname || ''}</td>
            <td>${job.jobcount || ''}</td>
            <td><span class="badge badge-red">${job.status || 'ABRT'}</span></td>
            <td>${formatSapDate(job.sdlstrtdt)} ${formatSapTime(job.sdlstrttm)}</td>
            <td>${formatSapDate(job.enddate)} ${formatSapTime(job.endtime)}</td>
            <td>${job.username || ''}</td>
            <td>${job.duration != null ? `${job.duration}s` : ''}</td>
          </tr>`
        )
        .join('');

  const htmlBody = `
    <h2>Failed Jobs Report</h2>
    <p><strong>Instance:</strong> ${instanceName}</p>
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

  let transporter;
  let fromAddress;

  if (smtpOverride) {
    transporter = nodemailer.createTransport(smtpOverride);
    fromAddress = smtpOverride.from_address || smtpOverride.auth?.user || 'noreply@sap-dashboard.local';
  } else if (instanceId) {
    const result = await getTransporter(instanceId);
    transporter = result.transporter;
    fromAddress = result.fromAddress;
  } else {
    throw new Error('Either instanceId or smtpOverride must be provided to sendDailyReport');
  }

  const fullHtml = buildEmailTemplate(subject, '#1d4ed8', htmlBody);

  await transporter.sendMail({
    from: `"SAP Dashboard" <${fromAddress}>`,
    to: emailList.join(', '),
    subject,
    html: fullHtml,
  });

  console.log(`Daily report sent for ${instanceName} to ${emailList.join(', ')}`);
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
