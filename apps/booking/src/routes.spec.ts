import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router-dom';
import { bookingRouteDefinitions } from './routes';

describe('public booking routes', () => {
  it('redirects an unknown public URL to the public booking start', () => {
    const matches = matchRoutes(bookingRouteDefinitions, '/rota-inexistente');

    expect(matches).toHaveLength(1);
    expect(matches?.[0]?.route).toMatchObject({
      path: '*',
      redirectTo: '/appointments/guest',
    });
  });
});
