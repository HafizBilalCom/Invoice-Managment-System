import { useEffect, useMemo, useState } from 'react';
import { invoiceApi, profileApi, timelogApi } from '../services/api';

const initialState = {
  from: '',
  to: ''
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(value) {
  if (!value) {
    return '-';
  }

  const normalized = String(value).slice(0, 10);
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return normalized;
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

function getRangeFromPreset(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === 'today') {
    const iso = toIsoDate(today);
    return { from: iso, to: iso };
  }

  if (preset === 'last2days') {
    return { from: toIsoDate(addDays(today, -1)), to: toIsoDate(today) };
  }

  if (preset === 'thisWeek') {
    const day = today.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = addDays(today, diffToMonday);
    return { from: toIsoDate(monday), to: toIsoDate(today) };
  }

  if (preset === 'lastWeek') {
    const day = today.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const thisMonday = addDays(today, diffToMonday);
    const lastMonday = addDays(thisMonday, -7);
    const lastSunday = addDays(thisMonday, -1);
    return { from: toIsoDate(lastMonday), to: toIsoDate(lastSunday) };
  }

  return { from: '', to: '' };
}

export default function InvoiceCreatePage({ user }) {
  const [form, setForm] = useState({ ...initialState, to: todayIso() });
  const [timelogs, setTimelogs] = useState([]);
  const [message, setMessage] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [projectFilter, setProjectFilter] = useState('all');
  const [rangePreset, setRangePreset] = useState('thisWeek');
  const [viewFrom, setViewFrom] = useState('');
  const [viewTo, setViewTo] = useState('');
  const [rateUsd, setRateUsd] = useState('');
  const [creatingGroupKey, setCreatingGroupKey] = useState('');

  const projectOptions = useMemo(() => {
    const map = new Map();
    timelogs.forEach((log) => {
      const key = log.projectId ? `id:${log.projectId}` : `key:${log.projectKey || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          value: key,
          label: `${log.projectKey || '-'}${log.projectName ? ` - ${log.projectName}` : ''}`
        });
      }
    });
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [timelogs]);

  const filteredTimelogs = useMemo(() => {
    return timelogs.filter((log) => {
      const projectMatch =
        projectFilter === 'all' ||
        (projectFilter.startsWith('id:') && Number(log.projectId || 0) === Number(projectFilter.replace('id:', ''))) ||
        (projectFilter.startsWith('key:') && String(log.projectKey || '') === projectFilter.replace('key:', ''));

      const fromMatch = !viewFrom || String(log.workDate || '') >= viewFrom;
      const toMatch = !viewTo || String(log.workDate || '') <= viewTo;

      return projectMatch && fromMatch && toMatch;
    });
  }, [timelogs, projectFilter, viewFrom, viewTo]);

  const totalHours = useMemo(
    () => filteredTimelogs.reduce((sum, item) => sum + Number(item.hours || 0), 0).toFixed(2),
    [filteredTimelogs]
  );

  const groupedTimelogs = useMemo(() => {
    const groups = new Map();

    filteredTimelogs.forEach((log) => {
      const groupKey = log.projectId ? `id:${log.projectId}` : `key:${log.projectKey || 'unassigned'}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          projectId: log.projectId || null,
          projectKey: log.projectKey || '-',
          projectName: log.projectName || 'Unknown Project',
          projectNumber: log.projectNumber || '-',
          projectAccountNumber: log.projectAccountNumber || '-',
          totalHours: 0,
          rows: []
        });
      }

      const group = groups.get(groupKey);
      group.rows.push(log);
      group.totalHours += Number(log.hours || 0);
    });

    return [...groups.values()]
      .map((group) => ({
        ...group,
        totalHours: Number(group.totalHours.toFixed(2)),
        rows: group.rows.sort((a, b) => {
          const dateCompare = String(b.workDate || '').localeCompare(String(a.workDate || ''));
          if (dateCompare !== 0) {
            return dateCompare;
          }
          return Number(b.id || 0) - Number(a.id || 0);
        })
      }))
      .sort((a, b) => `${a.projectKey} ${a.projectName}`.localeCompare(`${b.projectKey} ${b.projectName}`));
  }, [filteredTimelogs]);

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
    profileApi
      .get()
      .then((response) => {
        const hourlyRate = response?.profile?.hourlyRateUsd;
        if (hourlyRate !== null && hourlyRate !== undefined && hourlyRate !== '') {
          setRateUsd(String(hourlyRate));
        }
      })
      .catch(() => {
        setRateUsd('');
      });
  }, []);

  useEffect(() => {
    if (rangePreset === 'custom') {
      return;
    }
    const range = getRangeFromPreset(rangePreset);
    setViewFrom(range.from);
    setViewTo(range.to);
  }, [rangePreset]);

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

  const createInvoiceForGroup = async (group) => {
    const resolvedRate = Number(rateUsd);
    if (!Number.isFinite(resolvedRate) || resolvedRate <= 0) {
      setMessage('Set a valid hourly rate before creating an invoice.');
      return;
    }

    const groupDates = group.rows
      .map((row) => String(row.workDate || ''))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    const startDate = viewFrom || groupDates[0];
    const endDate = viewTo || groupDates[groupDates.length - 1];

    if (!startDate || !endDate) {
      setMessage('Could not determine invoice date range from selected project timelogs.');
      return;
    }

    setCreatingGroupKey(group.key);
    setMessage(`Creating invoice for ${group.projectKey || group.projectName}...`);

    try {
      const invoice = await invoiceApi.syncCreate({
        projectId: group.projectId || null,
        projectKey: group.projectId ? null : group.projectKey,
        startDate,
        endDate,
        rate: resolvedRate,
        timesheetEntryIds: group.rows.map((row) => row.id)
      });

      setMessage(`Invoice created: ${invoice.invoiceNumber}`);
    } catch (error) {
      const backendMessage = error?.response?.data?.message || 'Failed to create invoice';
      const invoiceNumber = error?.response?.data?.invoiceNumber;
      setMessage(`${backendMessage}${invoiceNumber ? ` | ${invoiceNumber}` : ''}`);
    } finally {
      setCreatingGroupKey('');
    }
  };

  return (
    <div className="space-y-6">
      <form className="grid gap-4" onSubmit={onSubmit}>
        <h2 className="text-xl font-semibold text-white">Step 1: Sync Timelogs</h2>
        <p className="text-sm text-slate-400">
          Your connected Jira account ID is used automatically. Select date range and sync.
        </p>
        {!user?.isSuperAdmin ? (
          <p className="text-sm text-amber-200">
            Read-only sync mode. Only the configured super admin can start timelog sync jobs. You can still review
            existing timelogs and create invoices from them.
          </p>
        ) : null}
        {user?.isSuperAdmin && !user?.jiraConnected ? (
          <p className="text-sm text-amber-200">
            Connect Jira to run timelog sync. Other invoice actions remain available.
          </p>
        ) : null}

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
          disabled={!user?.isSuperAdmin || !user?.jiraConnected || isSyncing}
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
          Projects: {groupedTimelogs.length} | Rows: {filteredTimelogs.length} / {timelogs.length} | Total Hours:{' '}
          {totalHours}
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <input
            type="number"
            step="0.01"
            min="0"
            value={rateUsd}
            onChange={(event) => setRateUsd(event.target.value)}
            placeholder="Invoice Rate (USD)"
            className="rounded-lg border border-[#2D3748] bg-[#111928] px-3 py-2 text-sm text-white"
          />
          <div className="md:col-span-3 flex items-center text-xs text-slate-400">
            One invoice is created per project using the currently visible date range.
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <select
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="rounded-lg border border-[#2D3748] bg-[#111928] px-3 py-2 text-sm text-white"
          >
            <option value="all">All Projects</option>
            {projectOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={rangePreset}
            onChange={(event) => setRangePreset(event.target.value)}
            className="rounded-lg border border-[#2D3748] bg-[#111928] px-3 py-2 text-sm text-white"
          >
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="last2days">Last 2 Days</option>
            <option value="thisWeek">This Week</option>
            <option value="lastWeek">Last Week</option>
            <option value="custom">Custom Range</option>
          </select>

          <input
            type="date"
            value={viewFrom}
            onChange={(event) => {
              setRangePreset('custom');
              setViewFrom(event.target.value);
            }}
            className="rounded-lg border border-[#2D3748] bg-[#111928] px-3 py-2 text-sm text-white"
          />
          <input
            type="date"
            value={viewTo}
            onChange={(event) => {
              setRangePreset('custom');
              setViewTo(event.target.value);
            }}
            className="rounded-lg border border-[#2D3748] bg-[#111928] px-3 py-2 text-sm text-white"
          />
        </div>

        <div className="mt-4 space-y-4">
          {groupedTimelogs.map((group) => (
            <div key={group.key} className="overflow-x-auto rounded-lg border border-[#3B82F6]/50 bg-[#0B1220] shadow-[0_0_0_1px_rgba(59,130,246,0.2)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#3B82F6]/40 bg-[#0F1B33] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[#E2E8F0]">
                    {group.projectKey} {group.projectName ? `- ${group.projectName}` : ''}
                  </p>
                  <p className="text-xs text-[#93C5FD]">
                    Project Number: {group.projectNumber} | Account: {group.projectAccountNumber} | Logs:{' '}
                    {group.rows.length}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-bold text-[#34D399]">Project Hours: {group.totalHours}</p>
                  <button
                    type="button"
                    onClick={() => createInvoiceForGroup(group)}
                    disabled={creatingGroupKey === group.key}
                    className="rounded-lg bg-[#F59E0B] px-3 py-2 text-xs font-semibold text-[#111827] hover:bg-[#FBBF24] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creatingGroupKey === group.key ? 'Creating...' : 'Create Invoice'}
                  </button>
                </div>
              </div>

              <table className="min-w-full text-sm">
                <thead className="bg-[#101B2E] text-left text-[#CBD5E1]">
                  <tr>
                    <th className="w-36 whitespace-nowrap px-4 py-3">Date</th>
                    <th className="w-40 whitespace-nowrap px-4 py-3">Issue</th>
                    <th className="w-24 whitespace-nowrap px-4 py-3">Hours</th>
                    <th className="px-4 py-3">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((log) => (
                    <tr key={log.id} className="border-t border-[#334155] text-[#E2E8F0]">
                      <td className="whitespace-nowrap px-4 py-3">{formatDisplayDate(log.workDate)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{log.issueKey || '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3">{log.hours}</td>
                      <td className="px-4 py-3">{log.description || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {groupedTimelogs.length === 0 && (
            <div className="rounded-lg border border-[#2D3748] bg-[#111928] px-4 py-4 text-sm text-slate-400">
              No timelogs found for selected filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
