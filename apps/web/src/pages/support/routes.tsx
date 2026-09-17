// Support routes (mounted by the orchestrator under `/support`).
// Keeps App.tsx untouched: just spreads `supportRoutes` as children of `/support`.
import { Outlet } from 'react-router';
import type { RouteObject } from 'react-router';
import QueuePage from './QueuePage';
import ThreadPage from './ThreadPage';

function SupportLayout() {
  return <Outlet />;
}

export const supportRoutes: RouteObject[] = [
  {
    element: <SupportLayout />,
    children: [
      { index: true, element: <QueuePage /> },
      { path: 't/:id', element: <ThreadPage /> },
    ],
  },
];
