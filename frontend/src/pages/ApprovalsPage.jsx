import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { invoiceApi } from '../services/api';

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

export default function ApprovalsPage({ user }) {
  const [invoices, setInvoices] = useState([]);
  const [commentByInvoice, setCommentByInvoice] = useState({});
  const [message, setMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [contractorFilter, setContractorFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = async () => {
    try {
      const params = {
        approvalsMine: true
      };

      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }

      if (projectFilter !== 'all') {
        params.projectKey = projectFilter;
      }
      if (contractorFilter !== 'all') {
        params.contractorId = contractorFilter;
      }
      if (dateFrom) {
        params.dateFrom = dateFrom;
      }
      if (dateTo) {
        params.dateTo = dateTo;
      }

      const rows = await invoiceApi.list(params);
      setInvoices(rows);
      setMessage('');
    } catch (error) {
      setInvoices([]);
      setMessage(error?.response?.data?.message || 'Failed to load approvals');
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter, projectFilter, contractorFilter, dateFrom, dateTo]);

  const projectOptions = useMemo(() => {
    const map = new Map();
    invoices.forEach((invoice) => {
      const key = invoice.projectKey || '-';
      if (!map.has(key)) {
        map.set(key, invoice.projectName || '-');
      }
    });
    return [...map.entries()].map(([value, label]) => ({ value, label: `${value} - ${label}` }));
  }, [invoices]);

  const contractorOptions = useMemo(() => {
    const map = new Map();
    invoices.forEach((invoice) => {
      map.set(invoice.contractorId, invoice.contractorName || `User ${invoice.contractorId}`);
    });
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [invoices]);

  const updateStatus = async (invoiceId, status) => {
    try {
      const comment = commentByInvoice[invoiceId] || '';
      await invoiceApi.updateStatus(invoiceId, { status, comment });
      setCommentByInvoice((prev) => ({ ...prev, [invoiceId]: '' }));
      await load();
      setMessage('Invoice status updated.');
    } catch (error) {
      setMessage(error?.response?.data?.message || 'Failed to update invoice status');
    }
  };

  const addComment = async (invoiceId) => {
    const comment = String(commentByInvoice[invoiceId] || '').trim();
    if (!comment) {
      setMessage('Comment is empty.');
      return;
    }

    try {
      await invoiceApi.addComment(invoiceId, { comment });
      setCommentByInvoice((prev) => ({ ...prev, [invoiceId]: '' }));
      await load();
      setMessage('Comment added.');
    } catch (error) {
      setMessage(error?.response?.data?.message || 'Failed to add comment');
    }
  };

  const canMarkPaid = user?.role === 'FINANCE' || user?.role === 'ADMIN' || user?.isSuperAdmin;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-white">My Approvals</h2>
      <p className="text-sm text-slate-400">
        Invoices assigned to you for approval. Default status shows all.
      </p>

      <div className="grid gap-3 md:grid-cols-5">
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-lg border border-[#2D3748] bg-[#1A2233] px-3 py-2 text-sm text-white"
        >
          <option value="all">All Statuses</option>
          <option value="PENDING_PM">Pending</option>
          <option value="APPROVED_PM">Approved</option>
          <option value="REJECTED_PM">Rejected</option>
          <option value="PAID">Paid</option>
        </select>
        <select
          value={projectFilter}
          onChange={(event) => setProjectFilter(event.target.value)}
          className="rounded-lg border border-[#2D3748] bg-[#1A2233] px-3 py-2 text-sm text-white"
        >
          <option value="all">All Projects</option>
          {projectOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={contractorFilter}
          onChange={(event) => setContractorFilter(event.target.value)}
          className="rounded-lg border border-[#2D3748] bg-[#1A2233] px-3 py-2 text-sm text-white"
        >
          <option value="all">All Users</option>
          {contractorOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
          className="rounded-lg border border-[#2D3748] bg-[#1A2233] px-3 py-2 text-sm text-white"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(event) => setDateTo(event.target.value)}
          className="rounded-lg border border-[#2D3748] bg-[#1A2233] px-3 py-2 text-sm text-white"
        />
      </div>

      <p className="text-sm text-slate-300">{message}</p>

      <div className="space-y-3">
        {invoices.map((invoice) => {
          const pdfUrl = invoiceApi.pdfUrl(invoice.pdfPath);
          const canActOnInvoice =
            invoice.statusCode === 'PENDING_PM' &&
            Number(invoice.currentStepApproverUserId || 0) === Number(user?.id || 0);
          return (
            <article key={invoice.id} className="rounded-xl border border-[#2D3748] bg-[#1A2233] p-4">
              <p className="text-sm text-slate-200">
                <strong className="text-white">{invoice.invoiceNumber}</strong> - {invoice.contractorName} ($
                {invoice.amount})
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Status: {invoice.status} | Project: {invoice.projectKey || '-'} | Period: {formatDate(invoice.startDate)} -{' '}
                {formatDate(invoice.endDate)}
              </p>
              {canActOnInvoice ? (
                <textarea
                  className="mt-3 w-full rounded-lg border border-[#2D3748] bg-[#111928] px-3 py-2 text-white"
                  rows="3"
                  placeholder="Optional comment"
                  value={commentByInvoice[invoice.id] || ''}
                  onChange={(event) =>
                    setCommentByInvoice((prev) => ({ ...prev, [invoice.id]: event.target.value }))
                  }
                />
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to={`/invoices/${invoice.id}`}
                  state={{ from: '/approvals', backLabel: 'Back to My Approvals' }}
                  className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20"
                >
                  View
                </Link>
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-[#3C50E0]/40 bg-[#3C50E0]/10 px-3 py-1.5 text-sm font-semibold text-[#AFC2FF] hover:bg-[#3C50E0]/20"
                >
                  View PDF
                </a>
                <a
                  href={pdfUrl}
                  download
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20"
                >
                  Download PDF
                </a>
                {canActOnInvoice ? (
                  <button
                    className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm font-semibold text-amber-200 hover:bg-amber-500/20"
                    onClick={() => addComment(invoice.id)}
                  >
                    Add Comment
                  </button>
                ) : null}
                {canActOnInvoice ? (
                  <button
                    className="rounded-lg border border-[#2D3748] bg-[#243041] px-3 py-1.5 text-sm text-white"
                    onClick={() => updateStatus(invoice.id, 'Approved by PM')}
                  >
                    Approve
                  </button>
                ) : null}
                {canActOnInvoice ? (
                  <button
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm text-white"
                    onClick={() => updateStatus(invoice.id, 'Rejected by PM')}
                  >
                    Reject
                  </button>
                ) : null}
                {canActOnInvoice && canMarkPaid ? (
                  <button
                    className="rounded-lg bg-[#3C50E0] px-3 py-1.5 text-sm text-white"
                    onClick={() => updateStatus(invoice.id, 'Paid')}
                  >
                    Mark Paid
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}

        {invoices.length === 0 ? (
          <p className="rounded-lg border border-[#2D3748] bg-[#1A2233] px-4 py-3 text-sm text-slate-400">
            No invoices found for current approval filters.
          </p>
        ) : null}
      </div>
    </div>
  );
}
