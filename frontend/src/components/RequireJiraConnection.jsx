import { Navigate } from 'react-router-dom';

export default function RequireJiraConnection({ user, children }) {
  if (!user?.jiraConnected) {
    return <Navigate to="/?jira=required" replace />;
  }

  return children;
}
