import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import ControlRoom from './pages/ControlRoom';
import Overlay from './pages/Overlay';
import './styles/main.css';
const Landing = lazy(() => import('./pages/Landing'));
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {location.pathname === '/' ? (
      <Suspense fallback={null}>
        <Landing />
      </Suspense>
    ) : location.pathname === '/overlay' ? (
      <Overlay />
    ) : (
      <ControlRoom />
    )}
  </React.StrictMode>,
);
