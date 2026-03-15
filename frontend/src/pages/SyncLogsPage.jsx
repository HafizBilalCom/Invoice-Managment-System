import { useEffect, useMemo, useState } from 'react';
import { syncLogsApi } from '../services/api';

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatDuration(startedAt, finishedAt) {
  if (!startedAt || !finishedAt) {
    return '-';
  }

  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return '-';
  }

  const totalSeconds = Math.round((end - start) / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function statusClass(status) {
  switch (status) {
    case 'COMPLETED':
      return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
    case 'FAILED':
      return 'bg-rose-500/15 text-rose-300 border border-rose-500/30';
    case 'RUNNING':
      return 'bg-amber-500/15 text-amber-300 border border-amber-500/30';
    case 'SKIPPED':
      return 'bg-slate-500/15 text-slate-300 border border-slate-500/30';
    default:
      return 'bg-slate-500/15 text-slate-300 border border-slate-500/30';
  }
}

export default function SyncLogsPage({ user }) {
  const [logs, setLogs] = useState([]);
  const [filterOptions, setFilterOptions] = useState({
    jobTypes: [],
    statuses: [],
    triggerSources: []
  });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    jobType: '',
    status: '',
    triggerSource: '',
    fromDate: '',
    toDate: ''
  });

  const loadLogs = async () => {
    setLoading(true);
    try {
      const response = await syncLogsApi.list(filters);
      setLogs(response.logs || []);
      setFilterOptions(response.filters || { jobTypes: [], statuses: [], triggerSources: [] });
      setMessage('');
    } catch (error) {
      setLogs([]);
      setMessage(error?.response?.data?.message || 'Failed to load sync job logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [filters.search, filters.jobType, filters.status, filters.triggerSource, filters.fromDate, filters.toDate]);

  const counts = useMemo(() => {
    return logs.reduce(
      (acc, log) => {
        acc.total += 1;
        acc[log.status] = (acc[log.status] || 0) + 1;
        return acc;
      },
      { total: 0, COMPLETED: 0, FAILED: 0, RUNNING: 0, SKIPPED: 0 }
    );
  }, [logs]);

  if (!user?.isSuperAdmin) {
    return <p className="text-sm text-amber-200">Only the configured super admin can view sync logs.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Sync Logs</h2>
          <p className="text-sm text-slate-400">
            Persistent database-backed logs for project catalog and Jira issue sync jobs.
          </p>
        </div>
        <button
          type="button"
          onClick={loadLogs}
          disabled={loading}
          className="rounded-lg bg-[#3C50E0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3043cc] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Refreshing...' : 'Refresh Logs'}
        </button>
      </div>

      <p className="text-sm text-slate-300">{message}</p>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="rounded-lg border border-[#2D3748] bg-[#0F172A] p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">Total</p>
          <p className="mt-1 text-lg font-semibold text-white">{counts.total}</p>
        </div>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="text-xs uppercase tracking-wide text-emerald-300">Completed</p>
          <p className="mt-1 text-lg font-semibold text-white">{counts.COMPLETED}</p>
        </div>
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
          <p className="text-xs uppercase tracking-wide text-rose-300">Failed</p>
          <p className="mt-1 text-lg font-semibold text-white">{counts.FAILED}</p>
        </div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-xs uppercase tracking-wide text-amber-300">Running</p>
          <p className="mt-1 text-lg font-semibold text-white">{counts.RUNNING}</p>
        </div>
        <div className="rounded-lg border border-slate-500/30 bg-slate-500/10 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-300">Skipped</p>
          <p className="mt-1 text-lg font-semibold text-white">{counts.SKIPPED}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-6">
        <input
          type="text"
          value={filters.search}
          onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          placeholder="Search request id, job, error, user"
          className="rounded-md border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-[#3C50E0] focus:outline-none md:col-span-2"
        />
        <select
          value={filters.jobType}
          onChange={(event) => setFilters((current) => ({ ...current, jobType: event.target.value }))}
          className="rounded-md border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-slate-100 focus:border-[#3C50E0] focus:outline-none"
        >
          <option value="">All Job Types</option>
          {filterOptions.jobTypes.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          className="rounded-md border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-slate-100 focus:border-[#3C50E0] focus:outline-none"
        >
          <option value="">All Statuses</option>
          {filterOptions.statuses.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          value={filters.triggerSource}
          onChange={(event) => setFilters((current) => ({ ...current, triggerSource: event.target.value }))}
          className="rounded-md border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-slate-100 focus:border-[#3C50E0] focus:outline-none"
        >
          <option value="">All Triggers</option>
          {filterOptions.triggerSources.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() =>
            setFilters({
              search: '',
              jobType: '',
              status: '',
              triggerSource: '',
              fromDate: '',
              toDate: ''
            })
          }
          className="rounded-md border border-[#2D3748] bg-[#1A2233] px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-[#243041]"
        >
          Clear
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <input
          type="date"
          value={filters.fromDate}
          onChange={(event) => setFilters((current) => ({ ...current, fromDate: event.target.value }))}
          className="rounded-md border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-slate-100 focus:border-[#3C50E0] focus:outline-none"
        />
        <input
          type="date"
          value={filters.toDate}
          onChange={(event) => setFilters((current) => ({ ...current, toDate: event.target.value }))}
          className="rounded-md border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-slate-100 focus:border-[#3C50E0] focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#2D3748]">
        <table className="min-w-full text-sm">
          <thead className="bg-[#111928] text-left text-slate-300">
            <tr>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">Trigger</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Request ID</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-[#2D3748] align-top text-slate-200">
                <td className="whitespace-nowrap px-4 py-3">{formatDateTime(log.startedAt)}</td>
                <td className="px-4 py-3">{log.jobType}</td>
                <td className="px-4 py-3">{log.triggerSource}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusClass(log.status)}`}>
                    {log.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div>{log.user?.name || '-'}</div>
                  <div className="text-xs text-slate-400">{log.user?.email || ''}</div>
                </td>
                <td className="whitespace-nowrap px-4 py-3">{formatDuration(log.startedAt, log.finishedAt)}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-300">{log.requestId}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setSelectedLog(log)}
                    className="rounded-md border border-[#2D3748] bg-[#1A2233] px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-[#243041]"
                  >
                    View Details
                  </button>
                </td>
              </tr>
            ))}

            {logs.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-400" colSpan={8}>
                  No sync logs found for the selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedLog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="max-h-[85vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-[#2D3748] bg-[#111928] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#2D3748] px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Sync Log Details</h3>
                <p className="mt-1 font-mono text-xs text-slate-400">{selectedLog.requestId}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-md border border-[#2D3748] bg-[#1A2233] px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-[#243041]"
              >
                Close
              </button>
            </div>

            <div className="grid max-h-[calc(85vh-72px)] gap-4 overflow-y-auto p-5 md:grid-cols-2">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Summary JSON</p>
                <pre className="overflow-x-auto rounded-md border border-[#2D3748] bg-[#0F172A] p-4 text-[11px] text-slate-300">
                  {JSON.stringify(selectedLog.summary || {}, null, 2)}
                </pre>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Details JSON</p>
                <pre className="overflow-x-auto rounded-md border border-[#2D3748] bg-[#0F172A] p-4 text-[11px] text-slate-300">
                  {JSON.stringify(selectedLog.details || {}, null, 2)}
                </pre>
              </div>
              {selectedLog.errorMessage ? (
                <div className="md:col-span-2">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Error</p>
                  <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
                    {selectedLog.errorMessage}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
