import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../services/api';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState('Completing sign-in...');

  useEffect(() => {
    let cancelled = false;

    const finishAuth = async () => {
      try {
        await authApi.me();
        if (cancelled) {
          return;
        }

        const jira = searchParams.get('jira');
        if (jira === 'connected') {
          navigate('/?jira=connected', { replace: true });
          return;
        }

        navigate('/', { replace: true });
      } catch (error) {
        if (cancelled) {
          return;
        }

        const jira = searchParams.get('jira');
        if (jira === 'failed') {
          navigate('/login?error=jira_auth_failed', { replace: true });
          return;
        }

        setMessage('Authentication failed. Redirecting to login...');
        navigate('/login?error=auth_failed', { replace: true });
      }
    };

    const timer = window.setTimeout(() => {
      finishAuth();
    }, 50);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [navigate, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f172a] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#243041] bg-[#111928] p-8 text-center shadow-2xl">
        <h1 className="text-xl font-semibold text-white">Signing You In</h1>
        <p className="mt-3 text-sm text-slate-400">{message}</p>
      </div>
    </div>
  );
}
