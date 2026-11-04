import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

interface Props {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-base flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-amber-DEFAULT border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
