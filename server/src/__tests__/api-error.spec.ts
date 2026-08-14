import { describe, expect, it } from 'vitest';
import { ApiError, normalizeApiError } from '../../../packages/utils/src/apiError';

describe('normalizeApiError', () => {
  it('preserves the public API error contract and field details', () => {
    const source = {
      response: {
        status: 422,
        data: {
          message: 'Existem campos inválidos.',
          code: 'VALIDATION_ERROR',
          requestId: 'request-123',
          details: { guestPhone: 'Telefone inválido.' },
        },
      },
      config: { url: '/appointments/guest' },
    };

    expect(normalizeApiError(source)).toMatchObject({
      name: 'ApiError',
      message: 'Existem campos inválidos.',
      code: 'VALIDATION_ERROR',
      status: 422,
      requestId: 'request-123',
      details: { guestPhone: 'Telefone inválido.' },
      response: source.response,
      config: source.config,
    });
  });

  it.each([
    [{ code: 'ECONNABORTED' }, 'TIMEOUT', 'A solicitação demorou demais. Tente novamente.'],
    [{ request: {} }, 'NETWORK_ERROR', 'Não foi possível conectar ao sistema. Verifique sua internet e tente novamente.'],
    [{ response: { status: 500, data: {} } }, 'INTERNAL_ERROR', 'Ocorreu um erro inesperado. Tente novamente mais tarde.'],
  ])('maps browser failures to a safe message', (source, code, message) => {
    expect(normalizeApiError(source)).toMatchObject({ code, message });
  });

  it('returns an error that was already normalized without losing its context', () => {
    const source = new ApiError('Aguarde.', 'RATE_LIMITED', 429, 'request-456');

    expect(normalizeApiError(source)).toBe(source);
  });
});
