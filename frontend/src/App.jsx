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
import ProtectedRoute from './components/ProtectedRoute';
import RequireJiraConnection from './components/RequireJiraConnection';
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
          element={
            <RequireJiraConnection user={user}>
              <InvoiceCreatePage user={user} />
            </RequireJiraConnection>
          }
        />
        <Route
          path="invoices"
          element={
            <RequireJiraConnection user={user}>
              <InvoicesPage />
            </RequireJiraConnection>
          }
        />
        <Route
          path="invoices/:invoiceId"
          element={
            <RequireJiraConnection user={user}>
              <InvoiceDetailPage />
            </RequireJiraConnection>
          }
        />
        <Route
          path="projects"
          element={
            <RequireJiraConnection user={user}>
              <ProjectsPage user={user} />
            </RequireJiraConnection>
          }
        />
        <Route
          path="projects/:projectId/issues"
          element={
            <RequireJiraConnection user={user}>
              <ProjectIssuesPage />
            </RequireJiraConnection>
          }
        />
        <Route
          path="tempo-accounts"
          element={
            <RequireJiraConnection user={user}>
              <TempoAccountsPage user={user} />
            </RequireJiraConnection>
          }
        />
        <Route
          path="jira-users"
          element={
            <RequireJiraConnection user={user}>
              <JiraUsersPage user={user} />
            </RequireJiraConnection>
          }
        />
        <Route
          path="approvals"
          element={
            <RequireJiraConnection user={user}>
              <ApprovalsPage />
            </RequireJiraConnection>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
