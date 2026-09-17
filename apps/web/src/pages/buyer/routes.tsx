import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { Outlet } from 'react-router';
import type { RouteObject } from 'react-router';
import { usePersona } from '../../lib/persona';
import BrowsePage from './BrowsePage';
import CheckoutPage from './CheckoutPage';
import StorePage from './StorePage';
import TrackPage from './TrackPage';
import { Toaster } from './toast';

function BuyerLayout() {
  const [persona, setPersona] = usePersona();

  useEffect(() => {
    if (persona !== 'buyer') setPersona('buyer');
  }, [persona, setPersona]);

  return (
    <div>
      <Outlet />
      <Toaster />
    </div>
  );
}

export const buyerRoutes: RouteObject[] = [
  {
    element: <BuyerLayout />,
    children: [
      { index: true, element: <BrowsePage /> },
      { path: 's/:id', element: <StorePage /> },
      { path: 'checkout', element: <CheckoutPage /> },
      { path: 'track/:id', element: <TrackPage /> },
    ],
  },
];
