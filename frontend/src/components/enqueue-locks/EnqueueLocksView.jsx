import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getLocks, deleteLocks } from '../../services/api';

const formatSapTime = (t) => (t ? `${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}` : '');
const formatSapDate = (d) => (d ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : '');

export default function EnqueueLocksView({ instanceId }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: locks = [], isLoading, refetch } = useQuery({
    queryKey: ['locks', instanceId],
    queryFn: () => getLocks(instanceId),
  });

  const deleteMutation = useMutation({
    mutationFn: (locksToDelete) => deleteLocks(instanceId, locksToDelete),
    onSuccess: (result) => {
      toast.success(`Deleted ${result.deleted} lock(s)`);
      setSelected(new Set());
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ['locks', instanceId] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  const toggleSelect = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === locks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(locks.map((l) => `${l.object}|${l.name1}|${l.name2}|${l.guname}`)));
    }
  };

  const handleDelete = () => {
    const locksToDelete = locks.filter((l) =>
      selected.has(`${l.object}|${l.name1}|${l.name2}|${l.guname}`)
    );
    deleteMutation.mutate(locksToDelete);
  };

  return (
    <div className="sap-panel">
      <div className="sap-panel-header">
        <span className="sap-panel-title">Enqueue Locks (SM12)</span>
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
        {isLoading ? 'Loading...' : `${locks.length} lock(s)`}
        {selected.size > 0 && <span className="ml-2 text-sap-blue">{selected.size} selected</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="sap-table">
          <thead>
            <tr>
              <th className="w-8">
                <input
                  type="checkbox"
                  checked={locks.length > 0 && selected.size === locks.length}
                  onChange={toggleAll}
                  className="cursor-pointer"
                />
              </th>
              <th>Lock Object</th>
              <th>Argument 1</th>
              <th>Argument 2</th>
              <th>User</th>
              <th>Program</th>
              <th>Mode</th>
              <th>Date</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {locks.map((lock) => {
              const key = `${lock.object}|${lock.name1}|${lock.name2}|${lock.guname}`;
              return (
                <tr key={key} className={selected.has(key) ? 'selected' : ''}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={() => toggleSelect(key)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="font-mono font-semibold">{lock.object}</td>
                  <td className="font-mono text-xs">{lock.name1}</td>
                  <td className="font-mono text-xs">{lock.name2}</td>
                  <td>{lock.guname}</td>
                  <td className="font-mono text-xs">{lock.repid}</td>
                  <td>
                    <span className={`status-badge ${lock.mode === 'E' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                      {lock.mode === 'E' ? 'Exclusive' : 'Shared'}
                    </span>
                  </td>
                  <td className="font-mono">{formatSapDate(lock.date)}</td>
                  <td className="font-mono">{formatSapTime(lock.time)}</td>
                </tr>
              );
            })}
            {!isLoading && locks.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-6 text-gray-400">No enqueue locks found</td>
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
              Delete <strong>{selected.size}</strong> selected lock(s)? This cannot be undone.
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
