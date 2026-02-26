import { useEffect, useState } from 'react';
import { invoiceApi } from '../services/api';

export default function ApprovalsPage() {
  const [invoices, setInvoices] = useState([]);
  const [comment, setComment] = useState('');

  const load = () => invoiceApi.list().then(setInvoices).catch(() => setInvoices([]));

  useEffect(() => {
    load();
  }, []);

  const updateStatus = async (invoiceId, status) => {
    await invoiceApi.updateStatus(invoiceId, { status, comment, actor: 'PM/Finance' });
    setComment('');
    load();
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-white">Approvals</h2>
      <textarea
        className="w-full rounded-lg border border-[#2D3748] bg-[#1A2233] px-3 py-2 text-white"
        rows="3"
        placeholder="Optional comment"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
      />

      <div className="space-y-3">
        {invoices.map((invoice) => (
          <article key={invoice.id} className="rounded-xl border border-[#2D3748] bg-[#1A2233] p-4">
            <p className="text-sm text-slate-200">
              <strong className="text-white">{invoice.invoiceNumber}</strong> - {invoice.contractorName} (${invoice.amount})
            </p>
            <p className="mt-1 text-sm text-slate-400">Status: {invoice.status}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded-lg border border-[#2D3748] bg-[#243041] px-3 py-1.5 text-sm text-white" onClick={() => updateStatus(invoice.id, 'Approved by PM')}>
                Approve PM
              </button>
              <button className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm text-white" onClick={() => updateStatus(invoice.id, 'Rejected by PM')}>
                Reject
              </button>
              <button className="rounded-lg bg-[#3C50E0] px-3 py-1.5 text-sm text-white" onClick={() => updateStatus(invoice.id, 'Paid')}>
                Mark Paid
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
