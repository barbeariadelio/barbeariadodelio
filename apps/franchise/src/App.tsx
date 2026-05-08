import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import Layout from './components/Layout/Layout';

const Login = lazy(() => import('./pages/Login/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'));
const Services = lazy(() => import('./pages/Services/Services'));
const Finance = lazy(() => import('./pages/Finance/Finance'));
const Employees = lazy(() => import('./pages/Employees/Employees'));
const Clients = lazy(() => import('./pages/Clients/Clients'));
const Settings = lazy(() => import('./pages/Settings/Settings'));
const Inventory = lazy(() => import('./pages/Inventory/Inventory'));
const Permissions = lazy(() => import('./pages/Permissions/Permissions'));

function Loader() {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#A3A3A3', fontFamily: 'Inter, sans-serif' }}>Carregando...</div>;
}

export default function App() {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/services" element={<Services />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/permissions" element={<Permissions />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
