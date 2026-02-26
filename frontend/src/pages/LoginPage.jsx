import { Navigate, useSearchParams } from 'react-router-dom';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.8-5.5 3.8-3.3 0-6.1-2.7-6.1-6.1s2.8-6.1 6.1-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.3 12 2.3 6.8 2.3 2.6 6.5 2.6 11.7S6.8 21.1 12 21.1c6.9 0 9.2-4.8 9.2-7.3 0-.5-.1-.9-.1-1.3H12Z" />
    </svg>
  );
}

export default function LoginPage({ user, isLoading, oauthUrls }) {
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');

  if (!isLoading && user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0b1220] via-[#111928] to-[#1e293b] p-4">
      <div className="w-full max-w-lg rounded-2xl border border-[#2D3748] bg-[#111928] p-8 shadow-2xl">
        <h1 className="text-3xl font-bold text-white">Invoice Management System</h1>
        <p className="mt-2 text-sm text-slate-400">Login with your Google account to continue.</p>

        {error === 'domain_not_allowed' && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            Access denied. Your Google account domain is not allowed.
          </div>
        )}

        {error === 'auth_failed' && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            Authentication failed. Please try again.
          </div>
        )}

        <div className="mt-6 grid gap-3">
          <a
            className="flex items-center justify-center gap-2 rounded-lg border border-[#2D3748] bg-[#1A2233] px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-[#243041]"
            href={oauthUrls.googleAuthUrl}
          >
            <GoogleIcon />
            Login with Google
          </a>
        </div>
      </div>
    </div>
  );
}
