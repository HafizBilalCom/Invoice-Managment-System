import { useEffect, useMemo, useState } from 'react';
import { profileApi, workflowApi } from '../services/api';

const DEFAULT_ROWS = Array.from({ length: 6 }, (_, index) => ({
  stepOrder: index + 1,
  stepTitle: `Level ${index + 1} Approval`,
  approverUserId: null,
  isActive: index === 0,
  isFinal: index === 5
}));

export default function ApprovalWorkflowPage({ user }) {
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    setIsLoading(true);
    try {
      const [steps, candidates] = await Promise.all([
        workflowApi.listSteps(),
        profileApi.listManagerCandidates()
      ]);

      const map = new Map(steps.map((step) => [Number(step.stepOrder), step]));
      const normalized = DEFAULT_ROWS.map((base) => {
        const existing = map.get(base.stepOrder);
        if (!existing) {
          return base;
        }
        return {
          stepOrder: base.stepOrder,
          stepTitle: existing.stepTitle || base.stepTitle,
          approverUserId: existing.approverUserId ? Number(existing.approverUserId) : null,
          isActive: Boolean(existing.isActive),
          isFinal: Boolean(existing.isFinal)
        };
      });

      setRows(normalized);
      setUsers(candidates || []);
      setMessage('');
    } catch (error) {
      setMessage(error?.response?.data?.message || 'Failed to load workflow configuration');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const userOptions = useMemo(() => {
    return users
      .map((item) => ({
        value: item.id,
        label: `${item.name || 'Unknown'} (${item.email || 'no-email'})`
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [users]);

  const updateRow = (stepOrder, patch) => {
    setRows((prev) => prev.map((row) => (row.stepOrder === stepOrder ? { ...row, ...patch } : row)));
  };

  const setFinalStep = (stepOrder) => {
    setRows((prev) => prev.map((row) => ({ ...row, isFinal: row.stepOrder === stepOrder })));
  };

  const save = async () => {
    setIsSaving(true);
    try {
      const payload = rows.map((row) => ({
        stepOrder: row.stepOrder,
        stepTitle: row.stepTitle,
        approverUserId: row.stepOrder === 1 ? null : row.approverUserId,
        isActive: row.isActive,
        isFinal: row.isFinal
      }));
      const updated = await workflowApi.updateSteps(payload);
      const updatedMap = new Map(updated.map((step) => [Number(step.stepOrder), step]));
      setRows(
        DEFAULT_ROWS.map((base) => {
          const existing = updatedMap.get(base.stepOrder);
          if (!existing) {
            return base;
          }
          return {
            stepOrder: base.stepOrder,
            stepTitle: existing.stepTitle || base.stepTitle,
            approverUserId: existing.approverUserId ? Number(existing.approverUserId) : null,
            isActive: Boolean(existing.isActive),
            isFinal: Boolean(existing.isFinal)
          };
        })
      );
      setMessage('Approval workflow updated.');
    } catch (error) {
      setMessage(error?.response?.data?.message || 'Failed to save workflow configuration');
    } finally {
      setIsSaving(false);
    }
  };

  if (!user?.isSuperAdmin) {
    return <p className="text-sm text-amber-200">Only super admin can access this screen.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-white">Approval Workflow</h2>
        <p className="mt-1 text-sm text-slate-400">
          Configure up to 6 approval levels. Step 1 approver is selected by contractor during invoice submission.
        </p>
      </div>

      {isLoading ? <p className="text-sm text-slate-300">Loading workflow settings...</p> : null}

      <p className="text-sm text-slate-300">{message}</p>

      <div className="overflow-x-auto rounded-lg border border-[#2D3748]">
        <table className="min-w-full text-sm">
          <thead className="bg-[#111928] text-left text-slate-300">
            <tr>
              <th className="px-4 py-3">Step</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Final</th>
              <th className="px-4 py-3">Approver</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.stepOrder} className="border-t border-[#2D3748] text-slate-200">
                <td className="px-4 py-3">Level {row.stepOrder}</td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={row.stepTitle}
                    onChange={(event) => updateRow(row.stepOrder, { stepTitle: event.target.value })}
                    className="w-full rounded-lg border border-[#2D3748] bg-[#1A2233] px-3 py-2 text-sm text-white"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={row.isActive}
                    onChange={(event) => updateRow(row.stepOrder, { isActive: event.target.checked })}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="radio"
                    name="workflow-final-step"
                    checked={row.isFinal}
                    onChange={() => setFinalStep(row.stepOrder)}
                  />
                </td>
                <td className="px-4 py-3">
                  {row.stepOrder === 1 ? (
                    <span className="text-xs text-slate-400">From invoice submit popup (PM selection)</span>
                  ) : (
                    <select
                      value={row.approverUserId || ''}
                      onChange={(event) =>
                        updateRow(row.stepOrder, {
                          approverUserId: event.target.value ? Number(event.target.value) : null
                        })
                      }
                      className="w-full rounded-lg border border-[#2D3748] bg-[#1A2233] px-3 py-2 text-sm text-white"
                    >
                      <option value="">Select approver</option>
                      {userOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={isLoading || isSaving}
          className="rounded-lg bg-[#3C50E0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3043cc] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? 'Saving...' : 'Save Workflow'}
        </button>
      </div>
    </div>
  );
}
