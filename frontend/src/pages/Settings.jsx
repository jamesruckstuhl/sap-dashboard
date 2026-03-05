import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getInstances, getEmailConfig, updateEmailConfig } from '../services/api';

export default function Settings() {
  const { instanceId } = useParams();
  const id = Number(instanceId);

  const { data: instances = [] } = useQuery({ queryKey: ['instances'], queryFn: getInstances });
  const instance = instances.find((i) => i.id === id);

  const { data: emailConfig, isLoading } = useQuery({
    queryKey: ['emailConfig', id],
    queryFn: () => getEmailConfig(id),
    enabled: !!id,
  });

  const [form, setForm] = useState(null);
  useEffect(() => {
    if (emailConfig) {
      setForm({
        smtp_host: emailConfig.smtp_host || '',
        smtp_port: emailConfig.smtp_port || 587,
        smtp_user: emailConfig.smtp_user || '',
        smtp_password: '',
        from_address: emailConfig.from_address || '',
        alert_emails: (emailConfig.alert_emails || []).join(', '),
        report_time: emailConfig.report_time || '06:00',
        report_enabled: emailConfig.report_enabled ?? true,
        tablespace_pct_threshold: emailConfig.tablespace_pct_threshold ?? 85,
        tablespace_mb_threshold: emailConfig.tablespace_mb_threshold ?? 500,
      });
    }
  }, [emailConfig]);

  const saveMutation = useMutation({
    mutationFn: (data) => updateEmailConfig(id, data),
    onSuccess: () => toast.success('Settings saved'),
    onError: (err) => toast.error(err.response?.data?.error || 'Save failed'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      alert_emails: form.alert_emails.split(',').map((e) => e.trim()).filter(Boolean),
    };
    if (!payload.smtp_password) delete payload.smtp_password;
    saveMutation.mutate(payload);
  };

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  if (isLoading || !form) {
    return <div className="p-6 text-center text-gray-400 text-sm">Loading settings...</div>;
  }

  return (
    <div className="max-w-2xl">
      <div className="sap-panel">
        <div className="sap-panel-header">
          <span className="sap-panel-title">
            Instance Settings — {instance?.name || `#${id}`}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-6">
          {/* SMTP Config */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 border-b pb-1">
              SMTP Email Configuration
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="sap-label">SMTP Host</label>
                <input className="sap-input" value={form.smtp_host} onChange={(e) => set('smtp_host', e.target.value)}
                  placeholder="mail.company.com" />
              </div>
              <div>
                <label className="sap-label">Port</label>
                <input type="number" className="sap-input" value={form.smtp_port}
                  onChange={(e) => set('smtp_port', Number(e.target.value))} />
              </div>
              <div>
                <label className="sap-label">SMTP Username</label>
                <input className="sap-input" value={form.smtp_user}
                  onChange={(e) => set('smtp_user', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="sap-label">SMTP Password</label>
                <input type="password" className="sap-input" value={form.smtp_password}
                  onChange={(e) => set('smtp_password', e.target.value)}
                  placeholder={emailConfig?.has_smtp_password ? '(stored — enter to change)' : 'Enter password'} />
              </div>
              <div className="col-span-2">
                <label className="sap-label">From Address</label>
                <input className="sap-input" type="email" value={form.from_address}
                  onChange={(e) => set('from_address', e.target.value)}
                  placeholder="sap-alerts@company.com" />
              </div>
            </div>
          </section>

          {/* Alert Recipients */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 border-b pb-1">
              Alert Recipients
            </h3>
            <div>
              <label className="sap-label">Email Addresses (comma-separated)</label>
              <textarea
                className="sap-input h-20 font-mono resize-none"
                value={form.alert_emails}
                onChange={(e) => set('alert_emails', e.target.value)}
                placeholder="admin@company.com, basis-team@company.com"
              />
              <p className="text-xs text-gray-400 mt-0.5">Used for both tablespace alerts and daily job reports.</p>
            </div>
          </section>

          {/* Tablespace Thresholds */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 border-b pb-1">
              Tablespace Alert Thresholds
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="sap-label">Percentage Threshold (%)</label>
                <input type="number" min={1} max={100} step={1} className="sap-input"
                  value={form.tablespace_pct_threshold}
                  onChange={(e) => set('tablespace_pct_threshold', Number(e.target.value))} />
                <p className="text-xs text-gray-400 mt-0.5">Alert when used % exceeds this value.</p>
              </div>
              <div>
                <label className="sap-label">Free Space Threshold (MB)</label>
                <input type="number" min={0} step={100} className="sap-input"
                  value={form.tablespace_mb_threshold}
                  onChange={(e) => set('tablespace_mb_threshold', Number(e.target.value))} />
                <p className="text-xs text-gray-400 mt-0.5">Alert when free MB falls below this value.</p>
              </div>
            </div>
          </section>

          {/* Daily Report */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 border-b pb-1">
              Daily Failed Jobs Report
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="sap-label">Report Time (HH:MM)</label>
                <input type="time" className="sap-input w-32" value={form.report_time}
                  onChange={(e) => set('report_time', e.target.value)} />
              </div>
              <div className="flex items-end pb-0.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.report_enabled}
                    onChange={(e) => set('report_enabled', e.target.checked)} />
                  <span className="sap-label mb-0">Enable Daily Report</span>
                </label>
              </div>
            </div>
          </section>

          <div className="flex gap-2 pt-2 border-t border-sap-border">
            <button type="submit" className="sap-btn-primary" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
