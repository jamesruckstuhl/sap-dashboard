import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getUpdates, deleteUpdates } from '../../services/api';

const formatSapDate = (d) => (d ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : '');
const formatSapTime = (t) => (t ? `${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}` : '');

export default function FailedUpdatesView({ instanceId }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: updates = [], isLoading, refetch } = useQuery({
    queryKey: ['updates', instanceId],
    queryFn: () => getUpdates(instanceId),
  });

  const deleteMutation = useMutation({
    mutationFn: (vbkeys) => deleteUpdates(instanceId, vbkeys),
    onSuccess: (result) => {
      toast.success(`Deleted ${result.deleted} update(s)`);
      setSelected(new Set());
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ['updates', instanceId] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  const toggleSelect = (vbkey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(vbkey) ? next.delete(vbkey) : next.add(vbkey);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === updates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(updates.map((u) => u.vbkey)));
    }
  };

  const handleDelete = () => {
    deleteMutation.mutate([...selected]);
  };

  return (
    <div className="sap-panel">
      <div className="sap-panel-header">
        <span className="sap-panel-title">Failed Updates (SM14)</span>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <button className="sap-btn-danger" onClick={() => setConfirmOpen(true)}>
              Delete ({selected.size})
            </button>
          )}
          <button onClick={() => refetch()} className="sap-btn-secondary text-xs">↺ Refresh</button>
        </div>
      </div>

      <div className="px-4 py-1.5 text-xs text-gray-500 border-b border-sap-border">
        {isLoading ? 'Loading...' : `${updates.length} failed update(s)`}
        {selected.size > 0 && <span className="ml-2 text-sap-blue">{selected.size} selected</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="sap-table">
          <thead>
            <tr>
              <th className="w-8">
                <input
                  type="checkbox"
                  checked={updates.length > 0 && selected.size === updates.length}
                  onChange={toggleAll}
                  className="cursor-pointer"
                />
              </th>
              <th>Update Key</th>
              <th>Transaction</th>
              <th>User</th>
              <th>Client</th>
              <th>Date</th>
              <th>Time</th>
              <th>Error Message</th>
            </tr>
          </thead>
          <tbody>
            {updates.map((u) => (
              <tr key={u.vbkey} className={selected.has(u.vbkey) ? 'selected' : ''}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(u.vbkey)}
                    onChange={() => toggleSelect(u.vbkey)}
                    className="cursor-pointer"
                  />
                </td>
                <td className="font-mono text-xs">{u.vbkey}</td>
                <td className="font-mono font-semibold">{u.tcode}</td>
                <td>{u.uname}</td>
                <td>{u.mandt}</td>
                <td className="font-mono">{formatSapDate(u.vbdate)}</td>
                <td className="font-mono">{formatSapTime(u.vbtime)}</td>
                <td className="text-red-700 text-xs max-w-xs truncate" title={u.errmess}>
                  {u.errmess}
                </td>
              </tr>
            ))}
            {!isLoading && updates.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-6 text-gray-400">No failed updates found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-xl w-80">
            <div className="sap-panel-header rounded-t">
              <span className="sap-panel-title">Confirm Delete</span>
            </div>
            <div className="p-4 text-sm">
              Delete <strong>{selected.size}</strong> failed update(s)? This cannot be undone.
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-sap-border">
              <button className="sap-btn-secondary" onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button
                className="sap-btn-danger"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
