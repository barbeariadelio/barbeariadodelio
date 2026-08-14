export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'DUPLICATE_RESOURCE'
  | 'CONFLICT'
  | 'INVALID_IDENTIFIER'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPLOAD_INVALID_FILE'
  | 'UPLOAD_TOO_LARGE'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    public override message: string,
    public statusCode: number = 400,
    public readonly code?: ApiErrorCode,
    public readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Recurso') {
    super(`${resource} não encontrado(a)`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Não autorizado') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acesso proibido') {
    super(message, 403, 'FORBIDDEN');
  }
}
