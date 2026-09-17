// Rider routes (mounted by the orchestrator under `/rider`).
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { Outlet } from 'react-router';
import type { RouteObject } from 'react-router';
import { PERSONA_STORAGE_KEY } from '../../lib/persona';
import ActivePage from './ActivePage';
import HomePage from './HomePage';
import { Toaster } from './toast';

function RiderLayout() {
  useEffect(() => {
    try {
      window.localStorage.setItem(PERSONA_STORAGE_KEY, 'rider');
    } catch {
      // Storage unavailable — api() already forces `x-persona: rider` anyway.
    }
  }, []);
  return (
    <div>
      <Outlet />
      <Toaster />
    </div>
  );
}

export const riderRoutes: RouteObject[] = [
  {
    element: <RiderLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'active', element: <ActivePage /> },
    ],
  },
];
