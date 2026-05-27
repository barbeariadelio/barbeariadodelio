import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';

const Landing = lazy(() => import('./pages/Landing/Landing'));
const Book = lazy(() => import('./pages/Book/Book'));
const GuestBook = lazy(() => import('./pages/GuestBook/GuestBook'));
const Login = lazy(() => import('./pages/Login/Login'));
const Profile = lazy(() => import('./pages/Profile/Profile'));

function Loader() {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-base)', color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif' }}>Carregando...</div>;
}

export default function App() {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
  }, []);

  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        <Route path="/" element={<Navigate to="/appointments/guest" replace />} />
        <Route path="/book/:unitId" element={<Book />} />
        <Route path="/login" element={<Login />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/appointments/guest" element={<GuestBook />} />
      </Routes>
    </Suspense>
  );
}
