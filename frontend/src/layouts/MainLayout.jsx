import { NavLink, Outlet, useNavigate } from 'react-router-dom';

export default function MainLayout({ user, onLogout, onJiraDisconnect, oauthUrls }) {
  const navigate = useNavigate();

  const links = [
    { to: '/', label: 'Dashboard', disabled: false },
    { to: '/timelog-sync', label: 'Step 1: Sync Timelogs', disabled: !user?.jiraConnected },
    { to: '/projects', label: 'Projects', disabled: !user?.jiraConnected },
    { to: '/tempo-accounts', label: 'Tempo Accounts', disabled: !user?.jiraConnected },
    { to: '/approvals', label: 'Approvals', disabled: !user?.jiraConnected }
  ];

  const handleLogout = async () => {
    await onLogout();
    navigate('/login', { replace: true });
  };

  const handleDisconnect = async () => {
    await onJiraDisconnect();
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#0f172a] lg:flex">
      <aside className="w-full border-b border-[#243041] bg-[#111928] p-5 lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r">
        <h1 className="text-2xl font-bold tracking-wide text-white">IMS Admin</h1>
        <p className="mt-1 text-sm text-slate-400">Google login + Jira connect workflow</p>

        {!user?.jiraConnected ? (
          <a
            className="mt-4 block rounded-lg bg-[#3C50E0] px-4 py-2 text-center text-sm font-semibold text-white hover:bg-[#3043cc]"
            href={oauthUrls.jiraConnectUrl}
          >
            Connect Jira Account
          </a>
        ) : (
          <div className="mt-4 rounded-lg border border-emerald-600/40 bg-emerald-700/10 px-3 py-2 text-xs text-emerald-300">
            <p>Jira email: {user.jiraEmail || 'N/A'}</p>
            <p className="mt-1">Jira account ID: {user.jiraAccountId}</p>
            <button
              type="button"
              onClick={handleDisconnect}
              className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
            >
              Disconnect Jira
            </button>
          </div>
        )}

        <nav className="mt-6 space-y-2">
          {links.map((item) => {
            if (item.disabled) {
              return (
                <div
                  key={item.to}
                  className="cursor-not-allowed rounded-lg px-4 py-2 text-sm font-medium text-slate-500"
                  title="Connect Jira first"
                >
                  {item.label} (Locked)
                </div>
              );
            }

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `block rounded-lg px-4 py-2 text-sm font-medium transition ${
                    isActive ? 'bg-[#3C50E0] text-white' : 'text-slate-300 hover:bg-[#1f2a3a]'
                  }`
                }
              >
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <main className="w-full p-4 md:p-8">
        <header className="mb-6 rounded-xl border border-[#2D3748] bg-[#111928] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-white md:text-2xl">Contractor Invoicing & Approval</h2>
              <p className="mt-1 text-sm text-slate-400">Step 1 syncs timelogs from Jira, then invoicing follows.</p>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-xs text-slate-300">{user?.name || user?.email || 'Authenticated User'}</p>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg border border-[#2D3748] bg-[#1A2233] px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-[#243041]"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <section className="rounded-xl border border-[#2D3748] bg-[#111928] p-5 md:p-6">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
