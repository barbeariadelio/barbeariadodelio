import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import rtracer from 'cls-rtracer';
import { ApiErrorCode, AppError } from '../errors/AppError';
import { logger } from '../utils/logger';

interface ErrorBody {
  message: string;
  code: ApiErrorCode;
  requestId: string;
  details?: Record<string, string>;
}

function requestIdFor(req: Request): string {
  const request = req as Request & { id?: string };
  return request.id || (rtracer.id() as string | undefined) || randomUUID();
}

function sendError(
  res: Response,
  requestId: string,
  statusCode: number,
  message: string,
  code: ApiErrorCode,
  details?: Record<string, string>,
): void {
  const body: ErrorBody = { message, code, requestId };
  if (details && Object.keys(details).length > 0) body.details = details;

  res.setHeader('X-Request-Id', requestId);
  res.status(statusCode).json(body);
}

function validationDetails(errors: unknown): Record<string, string> {
  if (!errors || typeof errors !== 'object') return {};

  return Object.entries(errors as Record<string, unknown>).reduce<Record<string, string>>((details, [field, value]) => {
    if (value && typeof value === 'object' && typeof (value as { message?: unknown }).message === 'string') {
      details[field] = (value as { message: string }).message;
    }
    return details;
  }, {});
}

function zodDetails(issues: unknown): Record<string, string> {
  if (!Array.isArray(issues)) return {};

  return issues.reduce<Record<string, string>>((details, issue) => {
    if (!issue || typeof issue !== 'object') return details;
    const { path, message } = issue as { path?: unknown; message?: unknown };
    if (!Array.isArray(path) || typeof message !== 'string') return details;

    const field = path.filter(segment => segment !== 'body' && segment !== 'query' && segment !== 'params').join('.');
    if (field) details[field] = message;
    return details;
  }, {});
}

function codeForStatus(statusCode: number): ApiErrorCode {
  if (statusCode === 401) return 'UNAUTHORIZED';
  if (statusCode === 403) return 'FORBIDDEN';
  if (statusCode === 404) return 'NOT_FOUND';
  if (statusCode === 409) return 'CONFLICT';
  if (statusCode === 413) return 'UPLOAD_TOO_LARGE';
  if (statusCode === 429) return 'RATE_LIMITED';
  return 'BAD_REQUEST';
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return;
  const requestId = requestIdFor(req);

  if (err instanceof AppError) {
    sendError(res, requestId, err.statusCode, err.message, err.code ?? codeForStatus(err.statusCode), err.details);
    return;
  }

  // Handle MongoDB Duplicate Key Error
  if ((err as any).code === 11000) {
    const keyPattern = (err as any).keyPattern || {};
    const preferredFields = ['email', 'phone', 'name'];
    const field = preferredFields.find(f => f in keyPattern) || Object.keys(keyPattern)[0] || 'campo';
    const messageMap: Record<string, string> = {
      email: 'Já existe um cadastro com este e-mail.',
      phone: 'Já existe um cadastro com este telefone.',
      name:  'Já existe um cadastro com este nome.',
    };
    sendError(
      res,
      requestId,
      409,
      messageMap[field] ?? 'Já existe um cadastro com estes dados.',
      'DUPLICATE_RESOURCE',
    );
    return;
  }

  // Handle Mongoose Validation Error
  if (err.name === 'ValidationError') {
    sendError(res, requestId, 422, 'Existem campos inválidos.', 'VALIDATION_ERROR', validationDetails((err as any).errors));
    return;
  }

  if (err.name === 'ZodError') {
    sendError(res, requestId, 422, 'Existem campos inválidos.', 'VALIDATION_ERROR', zodDetails((err as any).issues));
    return;
  }

  // Handle Mongoose CastError (invalid ID)
  if (err.name === 'CastError') {
    sendError(res, requestId, 400, 'Identificador inválido.', 'INVALID_IDENTIFIER');
    return;
  }

  if (err.name === 'MulterError') {
    const isTooLarge = (err as any).code === 'LIMIT_FILE_SIZE';
    sendError(
      res,
      requestId,
      isTooLarge ? 413 : 400,
      isTooLarge ? 'O arquivo excede o tamanho máximo permitido.' : 'O arquivo enviado não é válido.',
      isTooLarge ? 'UPLOAD_TOO_LARGE' : 'UPLOAD_INVALID_FILE',
    );
    return;
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    sendError(res, requestId, 401, 'Sua sessão não é válida. Entre novamente.', 'UNAUTHORIZED');
    return;
  }
  
  logger.error({ err, stack: err.stack, requestId }, 'Unhandled exception');
  sendError(res, requestId, 500, 'Ocorreu um erro inesperado. Tente novamente mais tarde.', 'INTERNAL_ERROR');
}
