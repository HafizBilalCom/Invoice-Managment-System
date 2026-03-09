import { useEffect, useMemo, useState } from 'react';
import { jiraUsersApi } from '../services/api';

function formatDate(value) {
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
    year: 'numeric'
  }).format(date);
}

export default function JiraUsersPage({ user }) {
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [isSyncing, setIsSyncing] = useState(false);

  const loadUsers = async () => {
    try {
      const rows = await jiraUsersApi.list();
      setUsers(rows);
      setMessage('');
    } catch (error) {
      setUsers([]);
      setMessage(error?.response?.data?.message || 'Failed to load Jira users');
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);


  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((item) => {
      const activeMatch =
        activeFilter === 'all' ||
        (activeFilter === 'active' && item.active) ||
        (activeFilter === 'inactive' && !item.active);

      const accountId = String(item.accountId || '').toLowerCase();
      const displayName = String(item.displayName || '').toLowerCase();
      const email = String(item.emailAddress || '').toLowerCase();
      const textMatch = !term || accountId.includes(term) || displayName.includes(term) || email.includes(term);

      return activeMatch && textMatch;
    });
  }, [users, search, activeFilter]);

  const syncUsers = async () => {
    setIsSyncing(true);
    setMessage('Syncing Jira users...');

    try {
      const result = await jiraUsersApi.sync();
      await loadUsers();
      setMessage(
        `Sync completed. Total fetched: ${result.totalFetched}, inserted: ${result.inserted}, updated: ${result.updated}, unchanged: ${result.unchanged}, pages: ${result.pageCount}.`
      );
    } catch (error) {
      const backendMessage = error?.response?.data?.message || 'Failed to sync Jira users';
      const backendError = error?.response?.data?.error;
      const requestId = error?.response?.data?.requestId;
      setMessage(
        `${backendMessage}${backendError ? ` | ${backendError}` : ''}${requestId ? ` | requestId: ${requestId}` : ''}`
      );
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Jira Users</h2>
          <p className="text-sm text-slate-400">Jira user catalog synced from Atlassian and available system-wide.</p>
        </div>
        {user?.isSuperAdmin ? (
          <button
            type="button"
            onClick={syncUsers}
            disabled={isSyncing || !user?.jiraConnected}
            className="rounded-lg bg-[#3C50E0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3043cc] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSyncing ? 'Syncing...' : 'Run Jira Users Sync'}
          </button>
        ) : null}
      </div>

      {!user?.isSuperAdmin ? (
        <p className="text-sm text-amber-200">
          Read-only mode. Only the configured super admin can run Jira users sync.
        </p>
      ) : null}
      {user?.isSuperAdmin && !user?.jiraConnected ? (
        <p className="text-sm text-amber-200">Connect Jira to run Jira users sync.</p>
      ) : null}
      <p className="text-sm text-slate-300">{message}</p>

      <div className="grid gap-3 md:grid-cols-2">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, email, account id"
          className="rounded-md border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-[#3C50E0] focus:outline-none"
        />
        <select
          value={activeFilter}
          onChange={(event) => setActiveFilter(event.target.value)}
          className="rounded-md border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-slate-100 focus:border-[#3C50E0] focus:outline-none"
        >
          <option value="all">All Users</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#2D3748]">
        <table className="min-w-full text-sm">
          <thead className="bg-[#111928] text-left text-slate-300">
            <tr>
              <th className="px-4 py-3">Display Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Account ID</th>
              <th className="px-4 py-3">Account Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Locale</th>
              <th className="px-4 py-3">Time Zone</th>
              <th className="px-4 py-3">Last Synced</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((item) => (
              <tr key={item.accountId} className="border-t border-[#2D3748] text-slate-200">
                <td className="px-4 py-3">{item.displayName || '-'}</td>
                <td className="px-4 py-3">{item.emailAddress || '-'}</td>
                <td className="px-4 py-3">{item.accountId}</td>
                <td className="px-4 py-3">{item.accountType || '-'}</td>
                <td className="px-4 py-3">{item.active ? 'Active' : 'Inactive'}</td>
                <td className="px-4 py-3">{item.locale || '-'}</td>
                <td className="px-4 py-3">{item.timeZone || '-'}</td>
                <td className="px-4 py-3">{formatDate(item.lastSyncedAt)}</td>
              </tr>
            ))}

            {filteredUsers.length === 0 && (
              <tr>
                <td className="px-4 py-4 text-slate-400" colSpan={8}>
                  No Jira users found for selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
