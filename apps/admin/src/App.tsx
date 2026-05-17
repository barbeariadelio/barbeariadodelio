import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import Layout from './components/Layout/Layout';

const Login = lazy(() => import('./pages/Login/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'));
const Clients = lazy(() => import('./pages/Clients/Clients'));
const Employees = lazy(() => import('./pages/Employees/Employees'));
const Services = lazy(() => import('./pages/Services/Services'));
const Finance = lazy(() => import('./pages/Finance/Finance'));
const Settings = lazy(() => import('./pages/Settings/Settings'));
const Inventory = lazy(() => import('./pages/Inventory/Inventory'));
const Permissions = lazy(() => import('./pages/Permissions/Permissions'));
const Units = lazy(() => import('./pages/Units/Units'));
const Sales = lazy(() => import('./pages/Sales/Sales'));

const spinnerStyle: React.CSSProperties = {
  width: '40px',
  height: '40px',
  borderRadius: '50%',
  border: '3px solid rgba(255,255,255,0.08)',
  borderTopColor: '#1565C0',
  animation: 'spin 0.75s linear infinite',
};

const keyframes = `@keyframes spin { to { transform: rotate(360deg); } }`;

function PageLoader() {
  return (
    <>
      <style>{keyframes}</style>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        height: '60vh',
      }}>
        <div style={spinnerStyle} />
        <span style={{ fontSize: '0.8125rem', color: '#5A5A5A', fontFamily: 'DM Sans, sans-serif', letterSpacing: '0.05em' }}>
          CARREGANDO
        </span>
      </div>
    </>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/services" element={<Services />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/permissions" element={<Permissions />} />
          <Route path="/units" element={<Units />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
