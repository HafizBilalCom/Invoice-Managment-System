import { useEffect, useMemo, useState } from 'react';
import { tempoAccountsApi } from '../services/api';

export default function TempoAccountsPage({ user }) {
  const [accounts, setAccounts] = useState([]);
  const [message, setMessage] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');

  const loadAccounts = async () => {
    try {
      const rows = await tempoAccountsApi.list();
      setAccounts(rows);
      setMessage('');
    } catch (error) {
      setAccounts([]);
      setMessage(error?.response?.data?.message || 'Failed to load Tempo accounts');
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const triggerSync = async () => {
    setIsSyncing(true);
    setMessage('Syncing Tempo accounts...');

    try {
      const result = await tempoAccountsApi.sync();
      setMessage(
        `Sync completed. Total: ${result.total}, Inserted: ${result.inserted}, Updated: ${result.updated}, Unchanged: ${result.unchanged}, Pages: ${result.pageCount}, Limit: ${result.limit}.`
      );
      await loadAccounts();
    } catch (error) {
      const backendMessage = error?.response?.data?.message || 'Failed to sync Tempo accounts';
      const backendError = error?.response?.data?.error;
      const requestId = error?.response?.data?.requestId;
      setMessage(
        `${backendMessage}${backendError ? ` | ${backendError}` : ''}${requestId ? ` | requestId: ${requestId}` : ''}`
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const statusOptions = useMemo(
    () => [...new Set(accounts.map((account) => account.status).filter(Boolean))].sort(),
    [accounts]
  );

  const categoryOptions = useMemo(
    () => [...new Set(accounts.map((account) => account.category?.name).filter(Boolean))].sort(),
    [accounts]
  );

  const filteredAccounts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return accounts.filter((account) => {
      const statusMatches = !statusFilter || account.status === statusFilter;
      const categoryMatches = !categoryFilter || account.category?.name === categoryFilter;

      const key = String(account.key || '').toLowerCase();
      const name = String(account.name || '').toLowerCase();
      const customer = String(account.customer?.name || '').toLowerCase();
      const textMatches = !term || key.includes(term) || name.includes(term) || customer.includes(term);

      return statusMatches && categoryMatches && textMatches;
    });
  }, [accounts, statusFilter, categoryFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Tempo Accounts</h2>
          <p className="text-sm text-slate-400">
            Daily cron sync plus manual trigger. All account fields are stored in database.
          </p>
        </div>
        {user?.isSuperAdmin ? (
          <button
            type="button"
            onClick={triggerSync}
            disabled={isSyncing}
            className="rounded-lg bg-[#3C50E0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3043cc] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSyncing ? 'Syncing...' : 'Run Tempo Accounts Sync'}
          </button>
        ) : null}
      </div>

      {!user?.isSuperAdmin ? (
        <p className="text-sm text-amber-200">
          Read-only mode. Only the configured super admin can run the Tempo accounts sync.
        </p>
      ) : null}
      <p className="text-sm text-slate-300">{message}</p>

      <div className="grid gap-3 md:grid-cols-3">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by key, name, customer"
          className="rounded-md border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-[#3C50E0] focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-md border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-slate-100 focus:border-[#3C50E0] focus:outline-none"
        >
          <option value="">All Statuses</option>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="rounded-md border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-slate-100 focus:border-[#3C50E0] focus:outline-none"
        >
          <option value="">All Categories</option>
          {categoryOptions.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#2D3748]">
        <table className="min-w-full text-sm">
          <thead className="bg-[#111928] text-left text-slate-300">
            <tr>
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Global</th>
              <th className="px-4 py-3">Lead Account ID</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Category Type</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Last Synced</th>
            </tr>
          </thead>
          <tbody>
            {filteredAccounts.map((account) => (
              <tr key={account.id} className="border-t border-[#2D3748] text-slate-200">
                <td className="px-4 py-3">{account.key || '-'}</td>
                <td className="px-4 py-3">{account.tempoAccountId}</td>
                <td className="px-4 py-3">{account.name || '-'}</td>
                <td className="px-4 py-3">{account.status || '-'}</td>
                <td className="px-4 py-3">{account.global ? 'Yes' : 'No'}</td>
                <td className="px-4 py-3">{account.lead?.accountId || '-'}</td>
                <td className="px-4 py-3">{account.category?.name || '-'}</td>
                <td className="px-4 py-3">{account.category?.type?.name || '-'}</td>
                <td className="px-4 py-3">{account.customer?.name || '-'}</td>
                <td className="px-4 py-3">{account.lastSyncedAt || '-'}</td>
              </tr>
            ))}

            {filteredAccounts.length === 0 && (
              <tr>
                <td className="px-4 py-4 text-slate-400" colSpan={10}>
                  No Tempo accounts found for selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
