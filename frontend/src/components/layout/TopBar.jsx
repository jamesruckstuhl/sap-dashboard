import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useInstanceStore } from '../../store/instanceStore';
import { useAuthStore } from '../../store/authStore';
import { getInstances } from '../../services/api';

export default function TopBar() {
  const user = useAuthStore((s) => s.user);
  const { selectedInstanceId, setSelectedInstance } = useInstanceStore();

  const { data: instances = [] } = useQuery({
    queryKey: ['instances'],
    queryFn: getInstances,
  });

  const selected = instances.find((i) => i.id === selectedInstanceId);

  return (
    <header className="bg-white border-b border-sap-border px-4 py-2 flex items-center gap-4 shadow-sm">
      <div className="flex items-center gap-2 flex-1">
        <label className="text-xs text-gray-500 font-medium whitespace-nowrap">Active Instance:</label>
        <select
          className="sap-input w-48"
          value={selectedInstanceId ?? ''}
          onChange={(e) => setSelectedInstance(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">— Select Instance —</option>
          {instances.map((inst) => (
            <option key={inst.id} value={inst.id}>
              {inst.name} ({inst.sid})
            </option>
          ))}
        </select>
        {selected && (
          <Link
            to={`/settings/${selected.id}`}
            className="text-xs text-sap-blue hover:underline"
          >
            ⚙ Settings
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>
          Logged in as <strong className="text-gray-800">{user?.username}</strong>
        </span>
        {selected && (
          <span className="bg-sap-blue-light text-sap-blue px-2 py-0.5 rounded font-medium">
            {selected.hostname} · Client {selected.client}
          </span>
        )}
      </div>
    </header>
  );
}
