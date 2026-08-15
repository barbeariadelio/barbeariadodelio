import type { RouteObject } from 'react-router-dom';

export type BookingRedirectRoute = RouteObject & {
  redirectTo: string;
};

export const bookingRouteDefinitions: BookingRedirectRoute[] = [
  {
    path: '*',
    redirectTo: '/appointments/guest',
  },
];
