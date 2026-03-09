import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
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
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function formatCurrency(value) {
  return Number(value || 0).toFixed(2);
}

function joinAddress(parts) {
  return parts.filter(Boolean).join(', ');
}

function DetailBlock({ label, value }) {
  return (
    <div className="rounded-lg border border-[#243041] bg-[#0F1725] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm text-slate-200">{value || '-'}</p>
    </div>
  );
}

function ApprovalBadge({ status, isCurrent }) {
  const normalized = String(status || '').toUpperCase();
  const styles =
    normalized === 'APPROVED'
      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
      : normalized === 'REJECTED'
        ? 'border-rose-500/40 bg-rose-500/15 text-rose-200'
        : isCurrent
          ? 'border-sky-500/40 bg-sky-500/15 text-sky-200'
          : 'border-slate-600 bg-slate-700/30 text-slate-300';

  const label =
    normalized === 'APPROVED'
      ? 'Approved'
      : normalized === 'REJECTED'
        ? 'Rejected'
        : isCurrent
          ? 'Pending'
          : 'Waiting';

  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${styles}`}>{label}</span>;
}

export default function InvoiceDetailPage() {
  const { invoiceId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [approvers, setApprovers] = useState([]);
  const [selectedApproverId, setSelectedApproverId] = useState('');
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const backTo = location.state?.from || '/invoices';
  const backLabel = location.state?.backLabel || 'Back to My Invoices';

  const loadInvoice = async () => {
    setIsLoading(true);
    try {
      const data = await invoiceApi.get(invoiceId);
      setInvoice(data);
      setMessage('');
    } catch (error) {
      setInvoice(null);
      setMessage(error?.response?.data?.message || 'Failed to load invoice');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInvoice();
    invoiceApi
      .listApprovers()
      .then((rows) => setApprovers(rows))
      .catch(() => setApprovers([]));
  }, [invoiceId]);

  const pdfUrl = useMemo(() => invoiceApi.pdfUrl(invoice?.pdfPath), [invoice?.pdfPath]);

  const regeneratePdf = async () => {
    setIsGenerating(true);
    setMessage('Regenerating invoice PDF...');
    try {
      const updated = await invoiceApi.regeneratePdf(invoice.id);
      setInvoice((current) => ({ ...current, ...updated }));
      setMessage('Invoice PDF regenerated.');
    } catch (error) {
      setMessage(error?.response?.data?.message || 'Failed to regenerate invoice PDF');
    } finally {
      setIsGenerating(false);
    }
  };

  const submitInvoice = async (pmApproverUserId) => {
    setIsSubmitting(true);
    setMessage('Submitting invoice for approval...');
    try {
      const updated = await invoiceApi.submit(invoice.id, { pmApproverUserId });
      setInvoice((current) => ({ ...current, ...updated }));
      setMessage('Invoice submitted for approval.');
      setShowSubmitDialog(false);
      setSelectedApproverId('');
    } catch (error) {
      setMessage(error?.response?.data?.message || 'Failed to submit invoice');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="text-sm text-slate-300">Loading invoice...</div>;
  }

  if (!invoice) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-rose-300">{message || 'Invoice not found.'}</p>
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className="rounded-lg border border-[#2D3748] bg-[#1A2233] px-4 py-2 text-sm text-white hover:bg-[#243041]"
        >
          {backLabel}
        </button>
      </div>
    );
  }

  const payout = invoice.payoutDetails || {};
  const approvalTimeline = invoice.approvalTimeline || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to={backTo} className="text-sm font-medium text-[#93C5FD] hover:text-white">
            {backLabel}
          </Link>
          <h2 className="mt-2 text-2xl font-semibold text-white">Invoice {invoice.invoiceNumber}</h2>
          <p className="mt-1 text-sm text-slate-400">
            Review invoice details online before submitting or downloading the PDF.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-[#3C50E0]/40 bg-[#3C50E0]/10 px-3 py-2 text-sm font-semibold text-[#AFC2FF] hover:bg-[#3C50E0]/20"
          >
            View PDF
          </a>
          <a
            href={pdfUrl}
            download
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20"
          >
            Download PDF
          </a>
          <button
            type="button"
            onClick={regeneratePdf}
            disabled={isGenerating}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isGenerating ? 'Generating...' : 'Generate PDF'}
          </button>
          {invoice.statusCode === 'DRAFT' ? (
            <button
              type="button"
              onClick={() => setShowSubmitDialog(true)}
              disabled={isSubmitting}
              className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>
          ) : null}
        </div>
      </div>

      {message ? <p className="text-sm text-slate-300">{message}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <section className="overflow-hidden rounded-2xl border border-[#274266] bg-[linear-gradient(180deg,#0E1A2E_0%,#0B1322_100%)]">
          <div className="border-b border-[#274266] px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#7DD3FC]">Invoice</p>
                <h3 className="mt-2 text-3xl font-semibold text-white">{invoice.invoiceNumber}</h3>
              </div>
              <div className="rounded-full border border-[#34D399]/40 bg-[#34D399]/10 px-4 py-2 text-sm font-semibold text-[#A7F3D0]">
                {invoice.status}
              </div>
            </div>
          </div>

          <div className="grid gap-4 px-6 py-6 md:grid-cols-2">
            <DetailBlock label="Contractor" value={invoice.contractorName} />
            <DetailBlock label="Email" value={invoice.contractorEmail} />
            <DetailBlock label="Project" value={[invoice.projectKey, invoice.projectName].filter(Boolean).join(' - ')} />
            <DetailBlock label="Period" value={`${formatDate(invoice.startDate)} to ${formatDate(invoice.endDate)}`} />
            <DetailBlock label="Project Number" value={invoice.projectNumber} />
            <DetailBlock label="Account Number" value={invoice.projectAccountNumber} />
            <DetailBlock label="Assigned PM" value={invoice.pmApproverName || '-'} />
          </div>

          <div className="grid gap-px border-t border-[#274266] bg-[#274266] md:grid-cols-3">
            <div className="bg-[#08111E] px-6 py-5">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total Hours</p>
              <p className="mt-2 text-2xl font-semibold text-white">{invoice.totalHours.toFixed(2)}</p>
            </div>
            <div className="bg-[#08111E] px-6 py-5">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Rate</p>
              <p className="mt-2 text-2xl font-semibold text-white">${formatCurrency(invoice.rate)}</p>
            </div>
            <div className="bg-[#08111E] px-6 py-5">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total Amount</p>
              <p className="mt-2 text-2xl font-semibold text-[#FDE68A]">${formatCurrency(invoice.amount)}</p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-[#2D3748] bg-[#0F1725] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Recipient</p>
            <div className="mt-4 space-y-2 text-sm text-slate-200">
              <p>{payout.payeeName || invoice.contractorName}</p>
              <p>{payout.payeeEmail || invoice.contractorEmail}</p>
              <p>
                {joinAddress([
                  payout.payeeAddressLine1,
                  payout.payeeAddressLine2,
                  joinAddress([payout.payeeCity, payout.payeeState, payout.payeePostalCode]),
                  payout.payeeCountry
                ]) || '-'}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#2D3748] bg-[#0F1725] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Payment Details</p>
            <div className="mt-4 space-y-2 text-sm text-slate-200">
              <p>Method: {payout.paymentMethod || '-'}</p>
              <p>Currency: {payout.paymentCurrency || '-'}</p>
              <p>Remittance Email: {payout.remittanceEmail || '-'}</p>
              <p>Account Holder: {payout.bankAccountTitle || '-'}</p>
              <p>Routing Number: {payout.bankRoutingNumber || '-'}</p>
              <p>Account Number: {payout.bankAccountNumber || '-'}</p>
              <p>Account Type: {payout.bankAccountType || '-'}</p>
              <p>Bank: {payout.bankName || '-'}</p>
              <p>
                Bank Address:{' '}
                {joinAddress([
                  payout.bankAddressLine1,
                  payout.bankAddressLine2,
                  joinAddress([payout.bankCity, payout.bankState, payout.bankPostalCode]),
                  payout.bankCountry
                ]) || '-'}
              </p>
            </div>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[#2D3748] bg-[#0F1725]">
        <div className="border-b border-[#2D3748] px-6 py-4">
          <h3 className="text-lg font-semibold text-white">Invoice Line Items</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[#111928] text-left text-slate-300">
              <tr>
                <th className="px-6 py-3">Issue</th>
                <th className="w-28 whitespace-nowrap px-6 py-3">Hours</th>
                <th className="w-32 whitespace-nowrap px-6 py-3">Rate</th>
                <th className="w-32 whitespace-nowrap px-6 py-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, index) => (
                <tr key={`${item.issueKey || 'issue'}-${index}`} className="border-t border-[#1D2736] text-slate-200">
                  <td className="px-6 py-4">
                    <div className="font-medium text-white">{item.issueKey || '-'}</div>
                    <div className="mt-1 text-slate-400">{item.issueSummary || item.label || '-'}</div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">{Number(item.quantity || 0).toFixed(2)}</td>
                  <td className="whitespace-nowrap px-6 py-4">${formatCurrency(item.unitRate)}</td>
                  <td className="whitespace-nowrap px-6 py-4">${formatCurrency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-[#2D3748] bg-[#0F1725] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">Approval Timeline</h3>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Workflow</p>
        </div>

        <div className="mt-6 space-y-0">
          <div className="grid grid-cols-[88px_28px_1fr] gap-4">
            <div className="pt-1 text-right text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              {formatDate(invoice.createdAt)}
            </div>
            <div className="flex flex-col items-center">
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-fuchsia-500/40 bg-fuchsia-500/20 text-xs font-bold text-fuchsia-100">
                S
              </div>
              {approvalTimeline.length > 0 ? <div className="mt-1 h-10 w-px border-l-2 border-dashed border-fuchsia-500/60" /> : null}
            </div>
            <div className="pb-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-fuchsia-500/40 bg-fuchsia-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-100">
                  Submitted
                </span>
                <p className="text-sm text-slate-200">by {invoice.contractorEmail || invoice.contractorName}</p>
              </div>
              <p className="mt-2 text-sm text-slate-400">{formatDateTime(invoice.createdAt)}</p>
            </div>
          </div>

          {approvalTimeline.length === 0 ? (
            <p className="pl-[132px] text-sm text-slate-400">This invoice has not entered the approval workflow yet.</p>
          ) : (
            approvalTimeline.map((step, index) => {
              const isLast = index === approvalTimeline.length - 1;
              const actor = step.approverEmail || step.approverName || 'Unassigned';
              return (
                <div key={step.id || step.stepOrder} className="grid grid-cols-[88px_28px_1fr] gap-4">
                  <div className="pt-1 text-right text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    {step.actedAt ? formatDate(step.actedAt) : `Level ${step.stepOrder}`}
                  </div>
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-full border text-sm font-bold ${
                        step.status === 'APPROVED'
                          ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-100'
                          : step.status === 'REJECTED'
                            ? 'border-rose-500/40 bg-rose-500/20 text-rose-100'
                            : step.isCurrent
                              ? 'border-sky-500/40 bg-sky-500/20 text-sky-100'
                              : 'border-slate-600 bg-slate-700/20 text-slate-300'
                      }`}
                    >
                      {step.status === 'APPROVED' ? '✓' : step.status === 'REJECTED' ? '!' : step.stepOrder}
                    </div>
                    {!isLast ? (
                      <div
                        className={`mt-1 h-14 w-px ${
                          step.status === 'APPROVED'
                            ? 'bg-emerald-500/70'
                            : step.status === 'REJECTED'
                              ? 'bg-rose-500/70'
                              : 'bg-slate-700'
                        }`}
                      />
                    ) : null}
                  </div>
                  <div className="pb-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <ApprovalBadge status={step.status} isCurrent={step.isCurrent} />
                      <p className="text-sm text-slate-200">{step.stepTitle}</p>
                    </div>
                    <p className="mt-2 text-sm text-slate-300">by {actor}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {step.actedAt ? formatDateTime(step.actedAt) : step.isCurrent ? 'Awaiting action' : 'Waiting for previous levels'}
                    </p>
                    {step.comment ? (
                      <div className="mt-3 rounded-xl border border-[#243041] bg-[#0A1220] p-3 text-sm text-slate-300">
                        {step.comment}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[#2D3748] bg-[#0F1725] p-6">
        <h3 className="text-lg font-semibold text-white">Activity</h3>
        <div className="mt-4 space-y-3">
          {invoice.comments.length === 0 ? (
            <p className="text-sm text-slate-400">No comments recorded for this invoice yet.</p>
          ) : (
            invoice.comments.map((comment) => (
              <div key={comment.id} className="rounded-xl border border-[#1D2736] bg-[#0A1220] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">{comment.actor}</p>
                  <p className="text-xs text-slate-500">{formatDate(comment.at)}</p>
                </div>
                <p className="mt-2 text-sm text-slate-300">{comment.comment}</p>
              </div>
            ))
          )}
        </div>
      </section>

      {showSubmitDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#2D3748] bg-[#111928] p-5">
            <h3 className="text-lg font-semibold text-white">Submit Invoice</h3>
            <p className="mt-1 text-sm text-slate-400">Select a project manager to receive this invoice.</p>
            <select
              value={selectedApproverId}
              onChange={(event) => setSelectedApproverId(event.target.value)}
              className="mt-4 w-full rounded-lg border border-[#2D3748] bg-[#1A2233] px-3 py-2 text-sm text-white"
            >
              <option value="">Select Project Manager</option>
              {approvers.map((approver) => (
                <option key={approver.id} value={approver.id}>
                  {approver.name} ({approver.email})
                </option>
              ))}
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowSubmitDialog(false);
                  setSelectedApproverId('');
                }}
                className="rounded-lg border border-[#2D3748] bg-[#1A2233] px-3 py-2 text-sm text-white hover:bg-[#243041]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submitInvoice(Number(selectedApproverId))}
                disabled={!selectedApproverId || isSubmitting}
                className="rounded-lg bg-[#3C50E0] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3043cc] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
