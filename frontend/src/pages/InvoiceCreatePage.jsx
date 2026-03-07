import { useEffect, useMemo, useState } from 'react';
import { timelogApi } from '../services/api';

const initialState = {
  from: '',
  to: ''
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function InvoiceCreatePage() {
  const [form, setForm] = useState({ ...initialState, to: todayIso() });
  const [timelogs, setTimelogs] = useState([]);
  const [message, setMessage] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);

  const totalHours = useMemo(
    () => timelogs.reduce((sum, item) => sum + Number(item.hours || 0), 0).toFixed(2),
    [timelogs]
  );

  const loadTimelogs = async () => {
    try {
      const rows = await timelogApi.list();
      setTimelogs(rows);
    } catch (error) {
      setTimelogs([]);
    }
  };

  useEffect(() => {
    loadTimelogs();
  }, []);

  useEffect(() => {
    if (!isSyncing) {
      return undefined;
    }

    const timer = setInterval(async () => {
      try {
        const status = await timelogApi.getSyncStatus();
        setSyncStatus(status);

        if (!status.running) {
          setIsSyncing(false);
          const rows = await timelogApi.list({ from: form.from, to: form.to });
          setTimelogs(rows);

          if (status.status === 'COMPLETED') {
            setMessage(
              `Timelog async sync completed. Synced: ${status.syncedCount}, Inserted: ${status.inserted}, Updated: ${status.updated}, Unchanged: ${status.unchanged}, Skipped(no project ref): ${status.skippedNoProjectReference}, Linked projects: ${status.linkedProjects}, Unlinked: ${status.unlinkedProjects}, Hours: ${status.totalHours}.`
            );
          } else {
            setMessage(
              `Timelog async sync failed${status.lastError ? ` | ${status.lastError}` : ''}${status.requestId ? ` | requestId: ${status.requestId}` : ''}`
            );
          }
        }
      } catch (error) {
        setIsSyncing(false);
        setMessage(error?.response?.data?.message || 'Failed to fetch timelog sync status');
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [isSyncing, form.from, form.to]);

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setIsSyncing(true);
    setMessage('Starting async timelog sync from Jira/Tempo...');

    try {
      const response = await timelogApi.sync(form);
      const status = await timelogApi.getSyncStatus();
      setSyncStatus(status);
      setMessage(
        `${response.message || 'Timelog sync started'}${response.requestId ? ` | requestId: ${response.requestId}` : ''}`
      );
    } catch (error) {
      const backendMessage = error?.response?.data?.message || 'Failed to sync timelogs';
      const backendError = error?.response?.data?.error;
      const requestId = error?.response?.data?.requestId;
      setMessage(
        `${backendMessage}${backendError ? ` | ${backendError}` : ''}${requestId ? ` | requestId: ${requestId}` : ''}`
      );
      setIsSyncing(false);
    } finally {
      // keep isSyncing=true while async job is running; it is cleared by polling when job completes/fails.
    }
  };

  return (
    <div className="space-y-6">
      <form className="grid gap-4" onSubmit={onSubmit}>
        <h2 className="text-xl font-semibold text-white">Step 1: Sync Timelogs</h2>
        <p className="text-sm text-slate-400">
          Your connected Jira account ID is used automatically. Select date range and sync.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <input
            className="rounded-lg border border-[#2D3748] bg-[#1A2233] px-3 py-2 text-white"
            name="from"
            type="date"
            value={form.from}
            onChange={onChange}
            required
          />
          <input
            className="rounded-lg border border-[#2D3748] bg-[#1A2233] px-3 py-2 text-white"
            name="to"
            type="date"
            value={form.to}
            onChange={onChange}
            required
          />
        </div>

        <button
          className="w-fit rounded-lg bg-[#3C50E0] px-4 py-2 font-semibold text-white hover:bg-[#3043cc] disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={isSyncing}
        >
          {isSyncing ? 'Sync In Progress...' : 'Sync Timelogs (Async)'}
        </button>
        <p className="text-sm text-slate-300">{message}</p>
        {syncStatus && (
          <p className="text-xs text-slate-400">
            Job status: {syncStatus.status || 'UNKNOWN'} | Processed: {syncStatus.syncedCount || 0} | Inserted:{' '}
            {syncStatus.inserted || 0} | Updated: {syncStatus.updated || 0} | Skipped:{' '}
            {syncStatus.skippedNoProjectReference || 0}
          </p>
        )}
      </form>

      <div className="rounded-xl border border-[#2D3748] bg-[#1A2233] p-4">
        <h3 className="text-base font-semibold text-white">Synced Timelogs</h3>
        <p className="mt-1 text-sm text-slate-400">
          Rows: {timelogs.length} | Total Hours: {totalHours}
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[#111928] text-left text-slate-300">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Project Number</th>
                <th className="px-4 py-3">Account Number</th>
                <th className="px-4 py-3">Issue</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3">Description</th>
              </tr>
            </thead>
            <tbody>
              {timelogs.map((log) => (
                <tr key={log.id} className="border-t border-[#2D3748] text-slate-200">
                  <td className="px-4 py-3">{log.workDate || '-'}</td>
                  <td className="px-4 py-3">{log.projectKey || '-'} {log.projectName ? `- ${log.projectName}` : ''}</td>
                  <td className="px-4 py-3">{log.projectNumber || '-'}</td>
                  <td className="px-4 py-3">{log.projectAccountNumber || '-'}</td>
                  <td className="px-4 py-3">{log.issueKey || '-'}</td>
                  <td className="px-4 py-3">{log.hours}</td>
                  <td className="px-4 py-3">{log.description || '-'}</td>
                </tr>
              ))}

              {timelogs.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-slate-400" colSpan={7}>
                    No timelogs synced yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
