import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  getInstances,
  createInstance,
  updateInstance,
  deleteInstance,
  testConnection,
} from '../services/api';

const EMPTY_FORM = {
  name: '', hostname: '', sysnr: '00', client: '100', sid: '', description: '',
  brtools_path: '',
  sap_user: '', sap_password: '',
  winrm_user: '', winrm_password: '', winrm_port: 5985, winrm_use_ssl: false,
};

function InstanceForm({ initial, onSave, onCancel, isSaving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleTest = async () => {
    if (!form.id) { toast.error('Save the instance first to test the connection'); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection(form.id);
      setTestResult(result);
      result.success ? toast.success(result.message) : toast.error(result.message);
    } catch (err) {
      setTestResult({ success: false, message: err.response?.data?.error || 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave(form); }}
      className="space-y-5"
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 border-b pb-1">
            SAP Connection
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {[['name','Display Name'],['sid','SID'],['hostname','Hostname'],['sysnr','System Nr'],['client','Client'],['description','Description']].map(([k, label]) => (
              <div key={k} className={k === 'hostname' || k === 'description' || k === 'name' ? 'col-span-2' : ''}>
                <label className="sap-label">{label}</label>
                <input className="sap-input" value={form[k]} onChange={(e) => set(k, e.target.value)}
                  required={['name','hostname','sysnr','client','sid'].includes(k)} />
              </div>
            ))}
            <div className="col-span-2">
              <label className="sap-label">SAP Username</label>
              <input className="sap-input" value={form.sap_user} onChange={(e) => set('sap_user', e.target.value)} required />
            </div>
            <div className="col-span-2">
              <label className="sap-label">SAP Password</label>
              <input type="password" className="sap-input" value={form.sap_password}
                onChange={(e) => set('sap_password', e.target.value)}
                placeholder={form.id ? '(unchanged)' : ''} />
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 border-b pb-1">
            WinRM / OS Access (for brtools)
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="sap-label">WinRM Username</label>
              <input className="sap-input" value={form.winrm_user} onChange={(e) => set('winrm_user', e.target.value)}
                placeholder="DOMAIN\serviceaccount" />
            </div>
            <div className="col-span-2">
              <label className="sap-label">WinRM Password</label>
              <input type="password" className="sap-input" value={form.winrm_password}
                onChange={(e) => set('winrm_password', e.target.value)}
                placeholder={form.id ? '(unchanged)' : ''} />
            </div>
            <div>
              <label className="sap-label">WinRM Port</label>
              <input type="number" className="sap-input" value={form.winrm_port}
                onChange={(e) => set('winrm_port', Number(e.target.value))} />
            </div>
            <div className="flex items-end pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.winrm_use_ssl}
                  onChange={(e) => set('winrm_use_ssl', e.target.checked)} />
                <span className="sap-label mb-0">Use HTTPS (SSL)</span>
              </label>
            </div>
            <div className="col-span-2">
              <label className="sap-label">brtools Path on SAP Host</label>
              <input className="sap-input font-mono text-xs" value={form.brtools_path}
                onChange={(e) => set('brtools_path', e.target.value)}
                placeholder="C:\usr\sap\SID\SYS\exe\uc\NTAMD64\brtools.exe" />
            </div>
          </div>
        </div>
      </div>

      {testResult && (
        <div className={`text-xs px-3 py-2 rounded border ${testResult.success ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {testResult.success ? '✓' : '✗'} {testResult.message}
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-sap-border">
        <button type="submit" className="sap-btn-primary" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Instance'}
        </button>
        {form.id && (
          <button type="button" className="sap-btn-secondary" onClick={handleTest} disabled={testing}>
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
        )}
        <button type="button" className="sap-btn-secondary ml-auto" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function InstanceManager() {
  const qc = useQueryClient();
  const [editTarget, setEditTarget] = useState(null); // null=hidden, 'new'=new, instance=edit
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: instances = [], isLoading } = useQuery({
    queryKey: ['instances'],
    queryFn: getInstances,
  });

  const saveMutation = useMutation({
    mutationFn: (form) =>
      form.id ? updateInstance(form.id, form) : createInstance(form),
    onSuccess: () => {
      toast.success('Instance saved');
      setEditTarget(null);
      qc.invalidateQueries({ queryKey: ['instances'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Save failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteInstance(id),
    onSuccess: () => {
      toast.success('Instance removed');
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['instances'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  return (
    <div className="space-y-4">
      <div className="sap-panel">
        <div className="sap-panel-header">
          <span className="sap-panel-title">SAP Instance Management</span>
          <button className="sap-btn-primary" onClick={() => setEditTarget('new')}>
            + Add Instance
          </button>
        </div>

        {editTarget && (
          <div className="p-4 border-b border-sap-border bg-blue-50">
            <h2 className="text-sm font-semibold mb-4">
              {editTarget === 'new' ? 'Add New SAP Instance' : `Edit — ${editTarget.name}`}
            </h2>
            <InstanceForm
              initial={editTarget === 'new' ? null : editTarget}
              onSave={(form) => saveMutation.mutate(form)}
              onCancel={() => setEditTarget(null)}
              isSaving={saveMutation.isPending}
            />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="sap-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>SID</th>
                <th>Hostname</th>
                <th>Sys Nr</th>
                <th>Client</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="text-center py-6 text-gray-400">Loading...</td></tr>
              )}
              {instances.map((inst) => (
                <tr key={inst.id}>
                  <td className="font-semibold">{inst.name}</td>
                  <td className="font-mono">{inst.sid}</td>
                  <td className="font-mono">{inst.hostname}</td>
                  <td className="font-mono">{inst.sysnr}</td>
                  <td className="font-mono">{inst.client}</td>
                  <td className="text-gray-500">{inst.description}</td>
                  <td>
                    <div className="flex gap-1">
                      <button className="sap-btn-secondary" onClick={() => setEditTarget(inst)}>Edit</button>
                      <button className="sap-btn-danger" onClick={() => setDeleteTarget(inst)}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && instances.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    No instances configured. Click "Add Instance" to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-xl w-80">
            <div className="sap-panel-header rounded-t">
              <span className="sap-panel-title">Remove Instance</span>
            </div>
            <div className="p-4 text-sm">
              Remove <strong>{deleteTarget.name}</strong> ({deleteTarget.sid})? All credentials and settings will be deleted.
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-sap-border">
              <button className="sap-btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button
                className="sap-btn-danger"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
