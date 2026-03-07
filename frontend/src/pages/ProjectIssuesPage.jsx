import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { projectsApi } from '../services/api';

export default function ProjectIssuesPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [issues, setIssues] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await projectsApi.issues(projectId);
        setProject(data.project);
        setIssues(data.issues || []);
        setMessage('');
      } catch (error) {
        setProject(null);
        setIssues([]);
        setMessage(error?.response?.data?.message || 'Failed to load project issues');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [projectId]);

  const statusOptions = useMemo(
    () => [...new Set(issues.map((issue) => issue.statusName).filter(Boolean))].sort(),
    [issues]
  );

  const typeOptions = useMemo(
    () => [...new Set(issues.map((issue) => issue.issueType).filter(Boolean))].sort(),
    [issues]
  );

  const filteredIssues = useMemo(() => {
    const term = search.trim().toLowerCase();

    return issues.filter((issue) => {
      const statusMatches = !statusFilter || issue.statusName === statusFilter;
      const typeMatches = !typeFilter || issue.issueType === typeFilter;

      const key = String(issue.issueKey || '').toLowerCase();
      const summary = String(issue.summary || '').toLowerCase();
      const textMatches = !term || key.includes(term) || summary.includes(term);

      return statusMatches && typeMatches && textMatches;
    });
  }, [issues, statusFilter, typeFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-white">
          Project Issues {project?.projectKey ? `- ${project.projectKey}` : ''}
        </h2>
        <Link
          to="/projects"
          className="rounded-md border border-[#2D3748] bg-[#1A2233] px-3 py-2 text-xs font-semibold text-white hover:bg-[#243041]"
        >
          Back to Projects
        </Link>
      </div>

      <p className="text-sm text-slate-400">
        {project?.projectName || 'Selected project'} | Total issues: {issues.length} | Showing: {filteredIssues.length}
      </p>
      <p className="text-sm text-slate-300">{message}</p>

      <div className="grid gap-3 md:grid-cols-3">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by issue key or summary"
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
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
          className="rounded-md border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-slate-100 focus:border-[#3C50E0] focus:outline-none"
        >
          <option value="">All Types</option>
          {typeOptions.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#2D3748]">
        <table className="min-w-full text-sm">
          <thead className="bg-[#111928] text-left text-slate-300">
            <tr>
              <th className="px-4 py-3">Issue Key</th>
              <th className="px-4 py-3">Summary</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Account ID</th>
              <th className="px-4 py-3">Last Synced</th>
            </tr>
          </thead>
          <tbody>
            {!loading &&
              filteredIssues.map((issue) => (
                <tr key={issue.id} className="border-t border-[#2D3748] text-slate-200">
                  <td className="px-4 py-3">{issue.issueKey || '-'}</td>
                  <td className="px-4 py-3">{issue.summary || '-'}</td>
                  <td className="px-4 py-3">{issue.statusName || '-'}</td>
                  <td className="px-4 py-3">{issue.issueType || '-'}</td>
                  <td className="px-4 py-3">{issue.account || '-'}</td>
                  <td className="px-4 py-3">{issue.accountId || '-'}</td>
                  <td className="px-4 py-3">{issue.lastSyncedAt || '-'}</td>
                </tr>
              ))}

            {!loading && filteredIssues.length === 0 && (
              <tr>
                <td className="px-4 py-4 text-slate-400" colSpan={7}>
                  No issues found for selected filters.
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td className="px-4 py-4 text-slate-400" colSpan={7}>
                  Loading issues...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
