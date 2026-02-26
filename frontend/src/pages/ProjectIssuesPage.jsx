import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { projectsApi } from '../services/api';

export default function ProjectIssuesPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [issues, setIssues] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

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
        {project?.projectName || 'Selected project'} | Total issues: {issues.length}
      </p>
      <p className="text-sm text-slate-300">{message}</p>

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
              issues.map((issue) => (
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

            {!loading && issues.length === 0 && (
              <tr>
                <td className="px-4 py-4 text-slate-400" colSpan={7}>
                  No issues found for this project.
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
