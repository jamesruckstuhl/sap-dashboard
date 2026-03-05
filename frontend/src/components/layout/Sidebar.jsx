import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useInstanceStore } from '../../store/instanceStore';
import { useAuthStore } from '../../store/authStore';
import { getInstances } from '../../services/api';

const NAV_ITEMS = [
  { label: 'Dashboard', to: '/', icon: '⊞' },
  { label: 'Manage Instances', to: '/instances', icon: '⚙' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const { selectedInstanceId, setSelectedInstance } = useInstanceStore();

  const { data: instances = [] } = useQuery({
    queryKey: ['instances'],
    queryFn: getInstances,
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="w-52 flex-shrink-0 bg-gray-800 text-gray-100 flex flex-col">
      <div className="px-4 py-3 bg-sap-blue">
        <span className="font-bold text-sm tracking-wide">SAP Dashboard</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-2 text-xs hover:bg-gray-700 transition-colors ${
                isActive ? 'bg-gray-700 text-white font-medium' : 'text-gray-300'
              }`
            }
          >
            <span className="text-base leading-none">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}

        {instances.length > 0 && (
          <div className="mt-4">
            <div className="px-4 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              SAP Instances
            </div>
            {instances.map((inst) => (
              <button
                key={inst.id}
                onClick={() => setSelectedInstance(inst.id)}
                className={`w-full text-left flex items-center gap-2 px-4 py-2 text-xs hover:bg-gray-700 transition-colors ${
                  selectedInstanceId === inst.id
                    ? 'bg-gray-700 text-white font-medium border-l-2 border-sap-blue'
                    : 'text-gray-300'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                <span className="truncate">{inst.name}</span>
                <span className="text-gray-500 ml-auto">{inst.sid}</span>
              </button>
            ))}
          </div>
        )}
      </nav>

      <div className="border-t border-gray-700 px-4 py-3">
        <button
          onClick={handleLogout}
          className="w-full text-left text-xs text-gray-400 hover:text-white transition-colors"
        >
          ⇥ Sign Out
        </button>
      </div>
    </aside>
  );
}
