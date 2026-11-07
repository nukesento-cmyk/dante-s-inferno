import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { authApi } from '../api/endpoints';
import { ApiError, setUnauthorizedHandler } from '../api/client';
import type { Me } from '../api/types';
import { Loading, ErrorState } from '../components/ui';
import { canAccess, homeFor } from './roles';

const MeContext = createContext<Me | null>(null);
export const useMe = () => {
  const m = useContext(MeContext);
  if (!m) throw new Error('useMe outside RequireAuth');
  return m;
};

export function RequireAuth({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const loc = useLocation();
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
  useEffect(() => {
    setUnauthorizedHandler(() => qc.setQueryData(['me'], null));
    return () => setUnauthorizedHandler(null);
  }, [qc]);

  if (q.isPending) return <Loading label="Checking session…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!canAccess(q.data.role, loc.pathname)) return <Navigate to={homeFor(q.data.role)} replace />;
  return <MeContext.Provider value={q.data}>{children}</MeContext.Provider>;
}
