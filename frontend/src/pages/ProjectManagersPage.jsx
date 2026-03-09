import { useEffect, useMemo, useState } from 'react';
import { profileApi } from '../services/api';

export default function ProjectManagersPage({ user, onImpersonate }) {
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [pmFilter, setPmFilter] = useState('all');
  const [loadingUserId, setLoadingUserId] = useState(null);
  const [impersonatingUserId, setImpersonatingUserId] = useState(null);
  const [canManage, setCanManage] = useState(true);

  const loadUsers = async () => {
    try {
      const rows = await profileApi.listManagerCandidates();
      setUsers(rows);
      setCanManage(true);
      setMessage('');
    } catch (error) {
      if (error?.response?.status === 403) {
        setCanManage(false);
        setUsers([]);
        setMessage('Only super admin can access this screen.');
        return;
      }
      setMessage(error?.response?.data?.message || 'Failed to load users');
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((item) => {
      const textMatch =
        !term ||
        String(item.name || '').toLowerCase().includes(term) ||
        String(item.email || '').toLowerCase().includes(term);
      const roleMatch = roleFilter === 'all' || item.role === roleFilter;
      const pmMatch =
        pmFilter === 'all' ||
        (pmFilter === 'pm' && item.isProjectManager) ||
        (pmFilter === 'nonpm' && !item.isProjectManager);
      return textMatch && roleMatch && pmMatch;
    });
  }, [users, search, roleFilter, pmFilter]);

  const roleOptions = useMemo(() => [...new Set(users.map((item) => item.role).filter(Boolean))], [users]);

  const togglePm = async (targetUser) => {
    setLoadingUserId(targetUser.id);
    try {
      await profileApi.setManagerCandidate(targetUser.id, {
        isProjectManager: !targetUser.isProjectManager
      });
      await loadUsers();
      setMessage('Project manager flag updated.');
    } catch (error) {
      setMessage(error?.response?.data?.message || 'Failed to update PM flag');
    } finally {
      setLoadingUserId(null);
    }
  };

  const impersonateUser = async (targetUser) => {
    if (!onImpersonate) {
      return;
    }

    setImpersonatingUserId(targetUser.id);
    try {
      await onImpersonate(targetUser.id);
      setMessage(`Now impersonating ${targetUser.name || targetUser.email || `User ${targetUser.id}`}.`);
    } catch (error) {
      setMessage(error?.response?.data?.message || 'Failed to impersonate user');
    } finally {
      setImpersonatingUserId(null);
    }
  };

  if (!canManage) {
    return <p className="text-sm text-amber-200">{message}</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-white">Project Managers</h2>
        <p className="mt-1 text-sm text-slate-400">
          Super admin can search/filter users and set or remove project manager access.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or email"
          className="rounded-lg border border-[#2D3748] bg-[#1A2233] px-3 py-2 text-sm text-white"
        />
        <select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          className="rounded-lg border border-[#2D3748] bg-[#1A2233] px-3 py-2 text-sm text-white"
        >
          <option value="all">All Roles</option>
          {roleOptions.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <select
          value={pmFilter}
          onChange={(event) => setPmFilter(event.target.value)}
          className="rounded-lg border border-[#2D3748] bg-[#1A2233] px-3 py-2 text-sm text-white"
        >
          <option value="all">All Users</option>
          <option value="pm">PM Only</option>
          <option value="nonpm">Non-PM Only</option>
        </select>
      </div>

      <p className="text-sm text-slate-300">{message}</p>

      <div className="overflow-x-auto rounded-lg border border-[#2D3748]">
        <table className="min-w-full text-sm">
          <thead className="bg-[#111928] text-left text-slate-300">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Project Manager</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((item) => (
              <tr key={item.id} className="border-t border-[#2D3748] text-slate-200">
                <td className="px-4 py-3">{item.name || '-'}</td>
                <td className="px-4 py-3">{item.email || '-'}</td>
                <td className="px-4 py-3">{item.role || '-'}</td>
                <td className="px-4 py-3">{item.isProjectManager ? 'Yes' : 'No'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => togglePm(item)}
                      disabled={loadingUserId === item.id || !user?.isSuperAdmin}
                      className="rounded-md bg-[#3C50E0] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3043cc] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loadingUserId === item.id ? 'Updating...' : item.isProjectManager ? 'Remove PM' : 'Set PM'}
                    </button>
                    <button
                      type="button"
                      onClick={() => impersonateUser(item)}
                      disabled={
                        !user?.isSuperAdmin ||
                        user?.isImpersonating ||
                        Number(user?.id || 0) === Number(item.id) ||
                        impersonatingUserId === item.id
                      }
                      className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {impersonatingUserId === item.id ? 'Switching...' : 'Impersonate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-400" colSpan={5}>
                  No users found for selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
