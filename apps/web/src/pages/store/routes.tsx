// Store-owner routes (mounted by the orchestrator under `/store`).
// Keeps App.tsx untouched: just spreads `storeRoutes` as children of `/store`.
import type { RouteObject } from 'react-router';
import DashboardPage from './DashboardPage';
import OrdersPage from './OrdersPage';
import OrderDetailPage from './OrderDetailPage';
import MenuPage from './MenuPage';

export const storeRoutes: RouteObject[] = [
  { index: true, element: <DashboardPage /> },
  { path: 'orders', element: <OrdersPage /> },
  { path: 'orders/:id', element: <OrderDetailPage /> },
  { path: 'menu', element: <MenuPage /> },
];
