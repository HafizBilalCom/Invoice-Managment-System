import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { projectsApi } from '../services/api';

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [message, setMessage] = useState('');
  const [syncingProjectId, setSyncingProjectId] = useState(null);
  const [syncingProjects, setSyncingProjects] = useState(false);
  const [syncingAllIssues, setSyncingAllIssues] = useState(false);
  const [allIssuesStatus, setAllIssuesStatus] = useState(null);
  const [search, setSearch] = useState('');

  const loadProjects = async () => {
    try {
      const rows = await projectsApi.list();
      setProjects(rows);
      setMessage('');
    } catch (error) {
      setProjects([]);
      setMessage(error?.response?.data?.message || 'Failed to load projects');
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (!syncingAllIssues) {
      return undefined;
    }

    const timer = setInterval(async () => {
      try {
        const status = await projectsApi.getSyncAllIssuesStatus();
        setAllIssuesStatus(status);

        if (!status.running) {
          setSyncingAllIssues(false);
          await loadProjects();
          setMessage(
            `All issues sync finished. Processed ${status.processedProjects || 0}/${status.totalProjects || 0}, success: ${status.successProjects || 0}, failed: ${status.failedProjects || 0}.`
          );
        }
      } catch (error) {
        setSyncingAllIssues(false);
        setMessage(error?.response?.data?.message || 'Failed to read all-issues sync status');
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [syncingAllIssues]);

  const totals = useMemo(() => {
    const linkedCount = projects.filter((p) => p.userTimelogCount > 0).length;
    const totalTimelogs = projects.reduce((sum, p) => sum + Number(p.userTimelogCount || 0), 0);
    const totalHours = projects.reduce((sum, p) => sum + Number(p.userTotalHours || 0), 0);

    return {
      linkedCount,
      totalTimelogs,
      totalHours: totalHours.toFixed(2)
    };
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return projects;
    }

    return projects.filter((project) => {
      const key = String(project.projectKey || '').toLowerCase();
      const name = String(project.projectName || '').toLowerCase();
      return key.includes(term) || name.includes(term);
    });
  }, [projects, search]);

  const syncProjectIssues = async (project) => {
    setSyncingProjectId(project.id);
    setMessage(`Syncing Jira issues for ${project.projectKey}...`);

    try {
      const result = await projectsApi.syncIssues(project.id);
      setMessage(
        `Issue sync completed for ${result.projectKey}. Issues total: ${result.totalIssues}, inserted: ${result.issueInserted}, updated: ${result.issueUpdated}, unchanged: ${result.issueUnchanged}.`
      );
    } catch (error) {
      const backendMessage = error?.response?.data?.message || 'Failed to sync project issues';
      const backendError = error?.response?.data?.error;
      const requestId = error?.response?.data?.requestId;
      setMessage(
        `${backendMessage}${backendError ? ` | ${backendError}` : ''}${requestId ? ` | requestId: ${requestId}` : ''}`
      );
    } finally {
      setSyncingProjectId(null);
    }
  };

  const syncProjects = async () => {
    setSyncingProjects(true);
    setMessage('Syncing projects from Jira...');

    try {
      const result = await projectsApi.syncProjects();
      await loadProjects();
      setMessage(`Project sync completed. Synced projects: ${result.syncedProjects}, pages: ${result.pages}.`);
    } catch (error) {
      const backendMessage = error?.response?.data?.message || 'Failed to sync projects';
      const backendError = error?.response?.data?.error;
      const requestId = error?.response?.data?.requestId;
      setMessage(
        `${backendMessage}${backendError ? ` | ${backendError}` : ''}${requestId ? ` | requestId: ${requestId}` : ''}`
      );
    } finally {
      setSyncingProjects(false);
    }
  };

  const syncAllProjectIssues = async () => {
    setSyncingAllIssues(true);
    setMessage('Starting async sync of issues for all projects...');

    try {
      const trigger = await projectsApi.syncAllIssues();
      const status = await projectsApi.getSyncAllIssuesStatus();
      setAllIssuesStatus(status);

      if (!status.running) {
        setSyncingAllIssues(false);
      } else {
        setMessage(
          `${trigger.message || 'All-project issues sync started'}. Processed ${status.processedProjects || 0}/${status.totalProjects || 0}.`
        );
      }
    } catch (error) {
      setSyncingAllIssues(false);
      const backendMessage = error?.response?.data?.message || 'Failed to start all-project issues sync';
      const backendError = error?.response?.data?.error;
      const requestId = error?.response?.data?.requestId;
      setMessage(
        `${backendMessage}${backendError ? ` | ${backendError}` : ''}${requestId ? ` | requestId: ${requestId}` : ''}`
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-white">Projects</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={syncProjects}
            disabled={syncingProjects}
            className="rounded-md bg-[#14A44D] px-3 py-2 text-xs font-semibold text-white hover:bg-[#118a41] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncingProjects ? 'Syncing Projects...' : 'Sync Projects'}
          </button>
          <button
            type="button"
            onClick={syncAllProjectIssues}
            disabled={syncingAllIssues}
            className="rounded-md bg-[#F59E0B] px-3 py-2 text-xs font-semibold text-white hover:bg-[#d88908] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncingAllIssues ? 'Syncing All Issues...' : 'Sync All Issues'}
          </button>
        </div>
      </div>
      <p className="text-sm text-slate-400">
        Project catalog with linked timelog counts and hours for your account only.
      </p>
      <p className="text-sm text-slate-300">{message}</p>
      {allIssuesStatus && (
        <p className="text-xs text-slate-400">
          All-issues job status: {allIssuesStatus.status || 'UNKNOWN'} | Processed:{' '}
          {allIssuesStatus.processedProjects || 0}/{allIssuesStatus.totalProjects || 0} | Success:{' '}
          {allIssuesStatus.successProjects || 0} | Failed: {allIssuesStatus.failedProjects || 0}
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-[#2D3748] bg-[#1A2233] p-3">
          <p className="text-xs text-slate-400">Projects in Catalog</p>
          <p className="mt-1 text-xl font-semibold text-white">{projects.length}</p>
        </div>
        <div className="rounded-lg border border-[#2D3748] bg-[#1A2233] p-3">
          <p className="text-xs text-slate-400">Projects with Your Timelogs</p>
          <p className="mt-1 text-xl font-semibold text-white">{totals.linkedCount}</p>
        </div>
        <div className="rounded-lg border border-[#2D3748] bg-[#1A2233] p-3">
          <p className="text-xs text-slate-400">Your Total Linked Hours</p>
          <p className="mt-1 text-xl font-semibold text-white">{totals.totalHours}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#2D3748]">
        <div className="border-b border-[#2D3748] bg-[#111928] p-3">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by project name or key"
            className="w-full rounded-md border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-[#3C50E0] focus:outline-none"
          />
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-[#111928] text-left text-slate-300">
            <tr>
              <th className="px-4 py-3">Project Key</th>
              <th className="px-4 py-3">Project Name</th>
              <th className="px-4 py-3">Project Number</th>
              <th className="px-4 py-3">Account Number</th>
              <th className="px-4 py-3">Jira Issues</th>
              <th className="px-4 py-3">Your Timelog Count</th>
              <th className="px-4 py-3">Your Hours</th>
              <th className="px-4 py-3">Issues</th>
              <th className="px-4 py-3">Issue Sync</th>
            </tr>
          </thead>
          <tbody>
            {filteredProjects.map((project) => (
              <tr key={project.id} className="border-t border-[#2D3748] text-slate-200">
                <td className="px-4 py-3">{project.projectKey || '-'}</td>
                <td className="px-4 py-3">{project.projectName || '-'}</td>
                <td className="px-4 py-3">{project.projectNumber || '-'}</td>
                <td className="px-4 py-3">{project.projectAccountNumber || '-'}</td>
                <td className="px-4 py-3">{project.jiraIssueCount || 0}</td>
                <td className="px-4 py-3">{project.userTimelogCount}</td>
                <td className="px-4 py-3">{project.userTotalHours}</td>
                <td className="px-4 py-3">
                  <Link
                    to={`/projects/${project.id}/issues`}
                    className="rounded-md border border-[#2D3748] bg-[#1A2233] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#243041]"
                  >
                    View Issues
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => syncProjectIssues(project)}
                    disabled={syncingProjectId === project.id}
                    className="rounded-md bg-[#3C50E0] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3043cc] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {syncingProjectId === project.id ? 'Syncing...' : 'Sync Issues'}
                  </button>
                </td>
              </tr>
            ))}

            {filteredProjects.length === 0 && (
              <tr>
                <td className="px-4 py-4 text-slate-400" colSpan={9}>
                  No projects found for your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Counts and hours are filtered by logged-in user id at backend query level.
      </p>
    </div>
  );
}
