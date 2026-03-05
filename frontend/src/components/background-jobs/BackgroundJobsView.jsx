import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import toast from 'react-hot-toast';
import { getJobs, rerunJob, getJobLog } from '../../services/api';

const formatSapDate = (d) => (d ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : '');
const formatSapTime = (t) => (t ? `${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}` : '');
const yesterday = format(subDays(new Date(), 1), 'yyyyMMdd');
const today = format(new Date(), 'yyyyMMdd');

const STATUS_OPTIONS = ['ABRT', 'FINI', 'ACTIVE', 'READY', ''];

function JobLogDialog({ instanceId, job, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['joblog', instanceId, job.jobname, job.jobcount],
    queryFn: () => getJobLog(instanceId, job.jobname, job.jobcount),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded shadow-xl w-[700px] max-h-[80vh] flex flex-col">
        <div className="sap-panel-header rounded-t">
          <span className="sap-panel-title">Job Log — {job.jobname} ({job.jobcount})</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <p className="text-xs text-gray-400">Loading log...</p>
          ) : (
            <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 bg-gray-50 p-3 rounded border border-sap-border">
              {data?.log || 'No log data available'}
            </pre>
          )}
        </div>
        <div className="flex justify-end px-4 py-3 border-t border-sap-border">
          <button className="sap-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function BackgroundJobsView({ instanceId }) {
  const [filters, setFilters] = useState({
    dateFrom: yesterday,
    dateTo: yesterday,
    status: 'ABRT',
    jobname: '',
  });
  const [logJob, setLogJob] = useState(null);

  const { data: jobs = [], isLoading, refetch } = useQuery({
    queryKey: ['jobs', instanceId, filters],
    queryFn: () => getJobs(instanceId, filters),
  });

  const rerunMutation = useMutation({
    mutationFn: ({ jobname, jobcount }) => rerunJob(instanceId, jobname, jobcount),
    onSuccess: () => { toast.success('Job resubmitted'); refetch(); },
    onError: (err) => toast.error(err.response?.data?.error || 'Rerun failed'),
  });

  const setFilter = (key, val) => setFilters((f) => ({ ...f, [key]: val }));

  return (
    <div className="sap-panel">
      <div className="sap-panel-header">
        <span className="sap-panel-title">Background Jobs (SM37)</span>
        <button onClick={() => refetch()} className="sap-btn-secondary text-xs">↺ Refresh</button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 px-4 py-3 bg-gray-50 border-b border-sap-border">
        <div>
          <label className="sap-label">From Date</label>
          <input
            type="date"
            className="sap-input w-36"
            value={filters.dateFrom ? `${filters.dateFrom.slice(0,4)}-${filters.dateFrom.slice(4,6)}-${filters.dateFrom.slice(6,8)}` : ''}
            onChange={(e) => setFilter('dateFrom', e.target.value.replace(/-/g, ''))}
          />
        </div>
        <div>
          <label className="sap-label">To Date</label>
          <input
            type="date"
            className="sap-input w-36"
            value={filters.dateTo ? `${filters.dateTo.slice(0,4)}-${filters.dateTo.slice(4,6)}-${filters.dateTo.slice(6,8)}` : ''}
            onChange={(e) => setFilter('dateTo', e.target.value.replace(/-/g, ''))}
          />
        </div>
        <div>
          <label className="sap-label">Status</label>
          <select className="sap-input w-28" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || 'All'}</option>)}
          </select>
        </div>
        <div>
          <label className="sap-label">Job Name</label>
          <input
            type="text"
            className="sap-input w-40"
            placeholder="*"
            value={filters.jobname}
            onChange={(e) => setFilter('jobname', e.target.value)}
          />
        </div>
        <button className="sap-btn-primary self-end" onClick={() => refetch()}>
          Execute
        </button>
      </div>

      {/* Results count */}
      <div className="px-4 py-1.5 text-xs text-gray-500 border-b border-sap-border bg-white">
        {isLoading ? 'Loading...' : `${jobs.length} job(s) found`}
      </div>

      <div className="overflow-x-auto">
        <table className="sap-table">
          <thead>
            <tr>
              <th>Job Name</th>
              <th>Job ID</th>
              <th>User</th>
              <th>Start Date</th>
              <th>Start Time</th>
              <th>End Time</th>
              <th className="text-right">Duration (s)</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={`${job.jobname}-${job.jobcount}`}>
                <td className="font-mono font-semibold">{job.jobname}</td>
                <td className="font-mono text-gray-500">{job.jobcount}</td>
                <td>{job.username}</td>
                <td className="font-mono">{formatSapDate(job.sdlstrtdt)}</td>
                <td className="font-mono">{formatSapTime(job.sdlstrttm)}</td>
                <td className="font-mono">{formatSapTime(job.endtime)}</td>
                <td className="text-right font-mono">{job.duration}</td>
                <td>
                  <span className={`status-badge ${
                    job.status === 'ABRT' ? 'status-abrt' :
                    job.status === 'FINI' ? 'status-fini' :
                    job.status === 'ACTIVE' ? 'status-active' : 'status-ready'
                  }`}>{job.status}</span>
                </td>
                <td>
                  <div className="flex gap-1">
                    <button
                      className="sap-btn-secondary text-xs"
                      onClick={() => setLogJob(job)}
                    >
                      Log
                    </button>
                    <button
                      className="sap-btn-primary text-xs"
                      onClick={() => rerunMutation.mutate({ jobname: job.jobname, jobcount: job.jobcount })}
                      disabled={rerunMutation.isPending}
                    >
                      Rerun
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && jobs.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-6 text-gray-400">
                  No jobs found for the selected criteria
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {logJob && (
        <JobLogDialog instanceId={instanceId} job={logJob} onClose={() => setLogJob(null)} />
      )}
    </div>
  );
}
