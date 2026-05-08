import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface Props { children: React.ReactNode; }

export default function ProtectedRoute({ children }: Props) {
  const { user, loading } = useAuth();
  if (loading) return null; // or a spinner
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'client') return <Navigate to="/login" replace />;
  return <>{children}</>;
}
