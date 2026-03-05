import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getTablespace, runBrtools } from '../../services/api';

function UsageBar({ pct, threshold }) {
  const color =
    pct >= threshold ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-sap-green';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-2.5 min-w-16">
        <div className={`${color} h-2.5 rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-xs font-semibold w-10 text-right ${pct >= threshold ? 'text-red-600' : pct >= 80 ? 'text-amber-600' : 'text-green-700'}`}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

function BrtoolsDialog({ tablespace, onClose, instanceId }) {
  const [sizeGb, setSizeGb] = useState(5);
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    setOutput('');
    try {
      const result = await runBrtools(instanceId, tablespace, sizeGb);
      setOutput(result.output);
      toast.success('brtools completed');
    } catch (err) {
      setOutput(err.response?.data?.error || 'brtools execution failed');
      toast.error('brtools failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded shadow-xl w-[560px] max-h-[80vh] flex flex-col">
        <div className="sap-panel-header rounded-t">
          <span className="sap-panel-title">Add Space — brtools ({tablespace})</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
        </div>
        <div className="p-4 space-y-3 flex-1 overflow-y-auto">
          <div className="sap-form-group">
            <label className="sap-label">Tablespace</label>
            <input className="sap-input bg-gray-50" value={tablespace} readOnly />
          </div>
          <div className="sap-form-group">
            <label className="sap-label">Size to Add (GB)</label>
            <input
              type="number"
              min={1}
              max={100}
              className="sap-input w-32"
              value={sizeGb}
              onChange={(e) => setSizeGb(Number(e.target.value))}
            />
          </div>
          {output && (
            <div>
              <label className="sap-label">brtools Output</label>
              <pre className="bg-gray-900 text-green-400 text-xs p-3 rounded font-mono overflow-x-auto max-h-60 whitespace-pre-wrap">
                {output}
              </pre>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-sap-border">
          <button className="sap-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="sap-btn-primary" onClick={handleRun} disabled={running}>
            {running ? 'Running...' : 'Run brtools'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TablespaceView({ instanceId }) {
  const qc = useQueryClient();
  const [brtoolsTarget, setBrtoolsTarget] = useState(null);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['tablespace', instanceId],
    queryFn: () => getTablespace(instanceId),
    refetchInterval: 5 * 60_000,
  });

  // Default threshold (backend sends per-row or use 85 as fallback)
  const threshold = 85;

  return (
    <div className="sap-panel">
      <div className="sap-panel-header">
        <span className="sap-panel-title">Tablespace Usage (ST04)</span>
        <button onClick={() => refetch()} className="sap-btn-secondary text-xs">
          ↺ Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="p-6 text-center text-gray-400 text-xs">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="sap-table">
            <thead>
              <tr>
                <th>Tablespace</th>
                <th>Type</th>
                <th className="text-right">Total (MB)</th>
                <th className="text-right">Used (MB)</th>
                <th className="text-right">Free (MB)</th>
                <th className="w-40">Usage</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.tablespace} className={row.used_pct >= threshold ? 'bg-red-50' : ''}>
                  <td className="font-mono font-semibold">{row.tablespace}</td>
                  <td>{row.type}</td>
                  <td className="text-right font-mono">{row.total_mb.toLocaleString()}</td>
                  <td className="text-right font-mono">{row.used_mb.toLocaleString()}</td>
                  <td className="text-right font-mono">{row.free_mb.toLocaleString()}</td>
                  <td className="min-w-32">
                    <UsageBar pct={row.used_pct} threshold={threshold} />
                  </td>
                  <td>
                    <span className={`status-badge ${row.status === 'ONLINE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {row.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="sap-btn-primary text-xs"
                      onClick={() => setBrtoolsTarget(row.tablespace)}
                    >
                      + Add Space
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-6 text-gray-400">
                    No tablespace data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {brtoolsTarget && (
        <BrtoolsDialog
          tablespace={brtoolsTarget}
          instanceId={instanceId}
          onClose={() => setBrtoolsTarget(null)}
        />
      )}
    </div>
  );
}
