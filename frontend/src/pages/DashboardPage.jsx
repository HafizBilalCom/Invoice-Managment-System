import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { invoiceApi } from '../services/api';

function StatCard({ title, value }) {
  return (
    <article className="rounded-xl border border-[#2D3748] bg-[#1A2233] p-4">
      <p className="text-sm text-slate-400">{title}</p>
      <p className="mt-2 text-3xl font-bold text-white">{value}</p>
    </article>
  );
}

export default function DashboardPage({ user, oauthUrls, onJiraDisconnect }) {
  const [searchParams] = useSearchParams();
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    if (!user?.jiraConnected) {
      setInvoices([]);
      return;
    }

    invoiceApi.list().then(setInvoices).catch(() => setInvoices([]));
  }, [user?.jiraConnected]);

  const counts = useMemo(() => {
    const pending = invoices.filter((item) => item.status.includes('Pending')).length;
    const approved = invoices.filter((item) => item.status.includes('Approved')).length;
    const paid = invoices.filter((item) => item.status === 'Paid').length;
    return { pending, approved, paid };
  }, [invoices]);

  const jiraStatus = searchParams.get('jira');

  return (
    <div className="space-y-6">
      {jiraStatus === 'connected' && (
        <div className="rounded-xl border border-emerald-600/30 bg-emerald-700/10 px-4 py-3 text-sm text-emerald-300">
          Jira account connected successfully. Invoice and approval features are now unlocked.
        </div>
      )}

      {!user?.jiraConnected && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-200">
            Connect your Jira account to enable invoice sync, invoice creation, and approvals.
          </p>
          <a
            className="mt-3 inline-block rounded-lg bg-[#3C50E0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3043cc]"
            href={oauthUrls.jiraConnectUrl}
          >
            Connect Jira Account
          </a>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Pending" value={counts.pending} />
        <StatCard title="Approved" value={counts.approved} />
        <StatCard title="Paid" value={counts.paid} />
      </div>

      <article className="rounded-xl border border-[#2D3748] bg-[#1A2233] p-4">
        <h3 className="text-base font-semibold text-white">Logged-in User (From DB)</h3>
        <div className="mt-3 grid gap-2 text-sm text-slate-200 md:grid-cols-2">
          <p><span className="text-slate-400">Name:</span> {user?.name || '-'}</p>
          <p><span className="text-slate-400">Email:</span> {user?.email || '-'}</p>
          <p><span className="text-slate-400">Role:</span> {user?.role || '-'}</p>
          <p><span className="text-slate-400">Login Provider:</span> {user?.provider || '-'}</p>
          <p><span className="text-slate-400">Jira Connected:</span> {user?.jiraConnected ? 'Yes' : 'No'}</p>
          <p><span className="text-slate-400">Jira Email:</span> {user?.jiraEmail || '-'}</p>
          <p><span className="text-slate-400">Jira Account ID:</span> {user?.jiraAccountId || '-'}</p>
        </div>
        {user?.jiraConnected && (
          <button
            type="button"
            onClick={onJiraDisconnect}
            className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
          >
            Disconnect Jira
          </button>
        )}
      </article>

      <div className="overflow-hidden rounded-xl border border-[#2D3748] bg-[#1A2233]">
        <div className="border-b border-[#2D3748] px-4 py-3">
          <h3 className="text-base font-semibold text-white">Recent Invoices</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[#111928] text-left text-slate-300">
              <tr>
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">Contractor</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">PDF</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-t border-[#2D3748] text-slate-200">
                  <td className="px-4 py-3">{invoice.invoiceNumber}</td>
                  <td className="px-4 py-3">{invoice.contractorName}</td>
                  <td className="px-4 py-3">${invoice.amount}</td>
                  <td className="px-4 py-3">{invoice.status}</td>
                  <td className="px-4 py-3">
                    {invoice.pdfPath ? (
                      <a
                        className="text-[#7da2ff] hover:underline"
                        href={`http://localhost:4000/${invoice.pdfPath}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
