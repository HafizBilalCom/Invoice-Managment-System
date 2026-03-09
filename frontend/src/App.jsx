import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import InvoiceCreatePage from './pages/InvoiceCreatePage';
import InvoicesPage from './pages/InvoicesPage';
import InvoiceDetailPage from './pages/InvoiceDetailPage';
import ApprovalsPage from './pages/ApprovalsPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectIssuesPage from './pages/ProjectIssuesPage';
import TempoAccountsPage from './pages/TempoAccountsPage';
import JiraUsersPage from './pages/JiraUsersPage';
import ProjectManagersPage from './pages/ProjectManagersPage';
import ApprovalWorkflowPage from './pages/ApprovalWorkflowPage';
import ProtectedRoute from './components/ProtectedRoute';
import { authApi } from './services/api';

export default function App() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const sessionUser = await authApi.me();
      setUser(sessionUser);
    } catch (error) {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const handleLogout = async () => {
    await authApi.logout();
    setUser(null);
  };

  const handleJiraDisconnect = async () => {
    await authApi.disconnectJira();
    await checkSession();
  };

  const handleImpersonate = async (targetUserId) => {
    await authApi.impersonate(targetUserId);
    await checkSession();
  };

  const handleStopImpersonation = async () => {
    await authApi.stopImpersonation();
    await checkSession();
  };

  return (
    <Routes>
      <Route path="/login" element={<LoginPage user={user} isLoading={isLoading} oauthUrls={authApi} />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      <Route
        path="/"
        element={
          <ProtectedRoute user={user} isLoading={isLoading}>
            <MainLayout
              user={user}
              onLogout={handleLogout}
              onJiraDisconnect={handleJiraDisconnect}
              onStopImpersonation={handleStopImpersonation}
              oauthUrls={authApi}
            />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={<DashboardPage user={user} oauthUrls={authApi} onJiraDisconnect={handleJiraDisconnect} />}
        />
        <Route
          path="profile"
          element={<ProfilePage user={user} oauthUrls={authApi} onJiraDisconnect={handleJiraDisconnect} />}
        />
        <Route
          path="timelog-sync"
          element={<InvoiceCreatePage user={user} />}
        />
        <Route
          path="invoices"
          element={<InvoicesPage />}
        />
        <Route
          path="invoices/:invoiceId"
          element={<InvoiceDetailPage />}
        />
        <Route
          path="projects"
          element={<ProjectsPage user={user} />}
        />
        <Route
          path="projects/:projectId/issues"
          element={<ProjectIssuesPage />}
        />
        <Route
          path="tempo-accounts"
          element={<TempoAccountsPage user={user} />}
        />
        <Route
          path="jira-users"
          element={<JiraUsersPage user={user} />}
        />
        <Route
          path="project-managers"
          element={<ProjectManagersPage user={user} onImpersonate={handleImpersonate} />}
        />
        <Route
          path="approval-workflow"
          element={<ApprovalWorkflowPage user={user} />}
        />
        <Route
          path="approvals"
          element={<ApprovalsPage user={user} />}
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
