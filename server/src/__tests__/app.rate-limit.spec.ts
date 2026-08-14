import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../app';

describe('public route rate limits', () => {
  it('limits repeated guest booking attempts', async () => {
    let response: request.Response | undefined;

    for (let attempt = 0; attempt < 11; attempt += 1) {
      response = await request(app).post('/appointments/guest').send({});
    }

    expect(response?.status).toBe(429);
    expect(response?.headers['x-request-id']).toEqual(expect.any(String));
    expect(response?.body).toMatchObject({
      code: 'RATE_LIMITED',
      requestId: expect.any(String),
    });
  });

  it('counts guest bookings per client rather than globally', async () => {
    // Each request presents a different real caller in X-Forwarded-For, the
    // way Traefik does in front of the container. Without `trust proxy` every
    // one of these would key on the single proxy address, share one counter,
    // and the eleventh customer of the day would be turned away.
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await request(app)
        .post('/appointments/guest')
        .set('X-Forwarded-For', `203.0.113.${attempt + 1}`)
        .send({});
      statuses.push(response.status);
    }

    expect(statuses).not.toContain(429);
  });

  it('returns the standard error contract for an unknown API endpoint', async () => {
    const response = await request(app).get('/auth/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.body).toMatchObject({
      message: 'Rota não encontrado(a)',
      code: 'NOT_FOUND',
      requestId: expect.any(String),
    });
  });
});
