import { useEffect, useState } from 'react';
import { tempoAccountsApi } from '../services/api';

export default function TempoAccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [message, setMessage] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Tempo Accounts</h2>
          <p className="text-sm text-slate-400">
            Daily cron sync plus manual trigger. All account fields are stored in database.
          </p>
        </div>
        <button
          type="button"
          onClick={triggerSync}
          disabled={isSyncing}
          className="rounded-lg bg-[#3C50E0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3043cc] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSyncing ? 'Syncing...' : 'Run Tempo Accounts Sync'}
        </button>
      </div>

      <p className="text-sm text-slate-300">{message}</p>

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
            {accounts.map((account) => (
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

            {accounts.length === 0 && (
              <tr>
                <td className="px-4 py-4 text-slate-400" colSpan={10}>
                  No Tempo accounts synced yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
