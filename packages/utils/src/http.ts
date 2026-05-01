import type { ApiError } from '@barber/types';

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    'message' in error &&
    typeof (error as ApiError).message === 'string'
  );
}
