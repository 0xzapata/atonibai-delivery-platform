// Ops routes (mounted by the orchestrator under `/ops`).
// Keeps App.tsx untouched: just spreads `opsRoutes` as children of `/ops`.
import { Outlet } from 'react-router';
import type { RouteObject } from 'react-router';
import OpsPage from './OpsPage';

function OpsLayout() {
  return <Outlet />;
}

export const opsRoutes: RouteObject[] = [
  {
    element: <OpsLayout />,
    children: [{ index: true, element: <OpsPage /> }],
  },
];
