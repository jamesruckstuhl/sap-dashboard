import { useInstanceStore } from '../store/instanceStore';
import TablespaceView from '../components/tablespace/TablespaceView';
import BackgroundJobsView from '../components/background-jobs/BackgroundJobsView';
import EnqueueLocksView from '../components/enqueue-locks/EnqueueLocksView';
import FailedUpdatesView from '../components/failed-updates/FailedUpdatesView';

export default function Dashboard() {
  const instanceId = useInstanceStore((s) => s.selectedInstanceId);

  if (!instanceId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <div className="text-4xl mb-3">⊞</div>
        <p className="text-sm font-medium">Select a SAP instance to begin monitoring</p>
        <p className="text-xs mt-1">Use the dropdown in the top bar or add an instance from Manage Instances.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TablespaceView instanceId={instanceId} />
      <BackgroundJobsView instanceId={instanceId} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <EnqueueLocksView instanceId={instanceId} />
        <FailedUpdatesView instanceId={instanceId} />
      </div>
    </div>
  );
}
