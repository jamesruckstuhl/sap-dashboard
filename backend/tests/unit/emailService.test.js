import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the database module
vi.mock('../../src/db/database.js', () => ({
  db: vi.fn(() => ({
    where: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue({
      instance_id: 1,
      smtp_host: 'smtp.test.com',
      smtp_port: 587,
      smtp_user: 'test@test.com',
      encrypted_smtp_password: null,
      from_address: 'noreply@test.com',
      alert_emails: '["admin@test.com"]',
    }),
  })),
}));

// Mock the crypto service
vi.mock('../../src/services/crypto/cryptoService.js', () => ({
  decrypt: vi.fn().mockReturnValue('smtp-password'),
  encrypt: vi.fn().mockReturnValue({ iv: 'aabbcc', authTag: 'ddeeff', encrypted: '112233' }),
}));

import nodemailer from 'nodemailer';
import { sendAlert, sendDailyReport, buildEmailTemplate } from '../../src/services/email/emailService.js';

const mockSmtpOverride = {
  host: 'smtp.mock.com',
  port: 587,
  auth: { user: 'test@mock.com', pass: 'password' },
  from_address: 'noreply@mock.com',
};

describe('emailService', () => {
  let sendMailMock;
  let createTransportSpy;

  beforeEach(() => {
    sendMailMock = vi.fn().mockResolvedValue({ messageId: 'test-message-id' });
    createTransportSpy = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail: sendMailMock });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildEmailTemplate', () => {
    it('should return a complete HTML document', () => {
      const html = buildEmailTemplate('Test Title', '#ff0000', '<p>Test content</p>');

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
    });

    it('should include the provided title', () => {
      const html = buildEmailTemplate('My Alert Title', '#ff0000', '<p>body</p>');

      expect(html).toContain('My Alert Title');
    });

    it('should include the provided header color', () => {
      const html = buildEmailTemplate('Title', '#1d4ed8', '<p>body</p>');

      expect(html).toContain('#1d4ed8');
    });

    it('should include the body content', () => {
      const html = buildEmailTemplate('Title', '#ff0000', '<p class="test">Custom body content</p>');

      expect(html).toContain('Custom body content');
    });

    it('should include a timestamp', () => {
      const html = buildEmailTemplate('Title', '#ff0000', '<p>body</p>');

      expect(html).toContain('Generated:');
    });
  });

  describe('sendAlert', () => {
    it('should call nodemailer createTransport with smtpOverride config', async () => {
      await sendAlert('PRD', 'Test Alert Subject', '<p>Alert body</p>', ['admin@company.com'], null, mockSmtpOverride);

      expect(createTransportSpy).toHaveBeenCalledWith(mockSmtpOverride);
    });

    it('should call sendMail with correct recipients', async () => {
      const recipients = ['admin@company.com', 'ops@company.com'];
      await sendAlert('PRD', 'Alert', '<p>body</p>', recipients, null, mockSmtpOverride);

      expect(sendMailMock).toHaveBeenCalledOnce();
      const callArgs = sendMailMock.mock.calls[0][0];
      expect(callArgs.to).toContain('admin@company.com');
      expect(callArgs.to).toContain('ops@company.com');
    });

    it('should use the correct subject', async () => {
      const subject = 'SAP Tablespace Alert - PRD';
      await sendAlert('PRD', subject, '<p>body</p>', ['admin@company.com'], null, mockSmtpOverride);

      const callArgs = sendMailMock.mock.calls[0][0];
      expect(callArgs.subject).toBe(subject);
    });

    it('should send HTML email', async () => {
      await sendAlert('PRD', 'Alert', '<p>body</p>', ['admin@company.com'], null, mockSmtpOverride);

      const callArgs = sendMailMock.mock.calls[0][0];
      expect(callArgs.html).toBeDefined();
      expect(callArgs.html).toContain('<!DOCTYPE html>');
    });

    it('should not call sendMail when emailList is empty', async () => {
      await sendAlert('PRD', 'Alert', '<p>body</p>', [], null, mockSmtpOverride);

      expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('should not call sendMail when emailList is null', async () => {
      await sendAlert('PRD', 'Alert', '<p>body</p>', null, null, mockSmtpOverride);

      expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('should throw if neither instanceId nor smtpOverride is provided', async () => {
      await expect(sendAlert('PRD', 'Alert', '<p>body</p>', ['admin@company.com'])).rejects.toThrow();
    });

    it('should include instance name in the from field', async () => {
      await sendAlert('PRD', 'Alert', '<p>body</p>', ['admin@company.com'], null, mockSmtpOverride);

      const callArgs = sendMailMock.mock.calls[0][0];
      expect(callArgs.from).toContain('noreply@mock.com');
    });
  });

  describe('sendDailyReport', () => {
    const mockJobs = [
      {
        jobname: 'RSUSR006',
        jobcount: '12345678',
        status: 'ABRT',
        sdlstrtdt: '20250301',
        sdlstrttm: '020000',
        enddate: '20250301',
        endtime: '020153',
        username: 'BATCHUSR',
        duration: 113,
      },
      {
        jobname: 'ZMONITOR_DAILY',
        jobcount: '12345679',
        status: 'ABRT',
        sdlstrtdt: '20250301',
        sdlstrttm: '030000',
        enddate: '20250301',
        endtime: '030045',
        username: 'SAPUSER',
        duration: 45,
      },
    ];

    it('should generate HTML containing a table with job data', async () => {
      await sendDailyReport('PRD', mockJobs, ['admin@company.com'], null, mockSmtpOverride);

      const callArgs = sendMailMock.mock.calls[0][0];
      const html = callArgs.html;

      expect(html).toContain('<table');
      expect(html).toContain('RSUSR006');
      expect(html).toContain('ZMONITOR_DAILY');
      expect(html).toContain('BATCHUSR');
      expect(html).toContain('SAPUSER');
    });

    it('should include the correct subject line with instance name and date', async () => {
      await sendDailyReport('PRD_SYSTEM', mockJobs, ['admin@company.com'], null, mockSmtpOverride);

      const callArgs = sendMailMock.mock.calls[0][0];
      expect(callArgs.subject).toContain('PRD_SYSTEM');
      expect(callArgs.subject).toContain('SAP Daily Report');
    });

    it('should show total failed jobs count in the email body', async () => {
      await sendDailyReport('PRD', mockJobs, ['admin@company.com'], null, mockSmtpOverride);

      const callArgs = sendMailMock.mock.calls[0][0];
      expect(callArgs.html).toContain(`${mockJobs.length}`);
    });

    it('should handle empty job list gracefully', async () => {
      await sendDailyReport('PRD', [], ['admin@company.com'], null, mockSmtpOverride);

      expect(sendMailMock).toHaveBeenCalledOnce();
      const callArgs = sendMailMock.mock.calls[0][0];
      expect(callArgs.html).toContain('No failed jobs found');
    });

    it('should not send email when emailList is empty', async () => {
      await sendDailyReport('PRD', mockJobs, [], null, mockSmtpOverride);

      expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('should format SAP date strings correctly (YYYYMMDD -> YYYY-MM-DD)', async () => {
      await sendDailyReport('PRD', mockJobs, ['admin@company.com'], null, mockSmtpOverride);

      const callArgs = sendMailMock.mock.calls[0][0];
      // Should format '20250301' as '2025-03-01'
      expect(callArgs.html).toContain('2025-03-01');
    });

    it('should format SAP time strings correctly (HHMMSS -> HH:MM:SS)', async () => {
      await sendDailyReport('PRD', mockJobs, ['admin@company.com'], null, mockSmtpOverride);

      const callArgs = sendMailMock.mock.calls[0][0];
      // Should format '020000' as '02:00:00'
      expect(callArgs.html).toContain('02:00:00');
    });

    it('should include job status badges in the output', async () => {
      await sendDailyReport('PRD', mockJobs, ['admin@company.com'], null, mockSmtpOverride);

      const callArgs = sendMailMock.mock.calls[0][0];
      expect(callArgs.html).toContain('ABRT');
    });

    it('should throw if neither instanceId nor smtpOverride is provided', async () => {
      await expect(sendDailyReport('PRD', mockJobs, ['admin@company.com'])).rejects.toThrow();
    });
  });
});
