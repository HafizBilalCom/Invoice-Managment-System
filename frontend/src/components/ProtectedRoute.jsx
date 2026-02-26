import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ user, isLoading, children }) {
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f172a]">
        <p className="text-sm text-slate-300">Checking session...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
