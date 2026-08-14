import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import multer from 'multer';
import { ZodError } from 'zod';
import { describe, expect, it } from 'vitest';
import { AppError } from '../shared/errors/AppError';
import { errorHandler } from '../shared/middlewares/errorHandler';

interface CapturedResponse {
  statusCode?: number;
  body?: Record<string, unknown>;
  headers: Record<string, string>;
}

function handle(error: Error): CapturedResponse {
  const captured: CapturedResponse = { headers: {} };
  const response = {
    setHeader(name: string, value: string) {
      captured.headers[name.toLowerCase()] = value;
      return this;
    },
    status(statusCode: number) {
      captured.statusCode = statusCode;
      return this;
    },
    json(body: Record<string, unknown>) {
      captured.body = body;
      return this;
    },
  } as unknown as Response;

  errorHandler(
    error,
    { id: 'request-test-123' } as unknown as Request,
    response,
    () => undefined,
  );

  return captured;
}

describe('errorHandler', () => {
  it('returns operational errors with a stable code, request id and field details', () => {
    const response = handle(new AppError(
      'Existem campos inválidos.',
      422,
      'VALIDATION_ERROR',
      { guestPhone: 'Telefone inválido.' },
    ));

    expect(response.statusCode).toBe(422);
    expect(response.headers['x-request-id']).toBe('request-test-123');
    expect(response.body).toEqual({
      message: 'Existem campos inválidos.',
      code: 'VALIDATION_ERROR',
      requestId: 'request-test-123',
      details: { guestPhone: 'Telefone inválido.' },
    });
  });

  it('maps duplicate email errors without exposing database data', () => {
    const duplicate = Object.assign(new Error('E11000 private collection detail'), {
      code: 11000,
      keyPattern: { email: 1 },
    });

    const response = handle(duplicate);

    expect(response.statusCode).toBe(409);
    expect(response.body).toMatchObject({
      message: 'Já existe um cadastro com este e-mail.',
      code: 'DUPLICATE_RESOURCE',
      requestId: 'request-test-123',
    });
    expect(JSON.stringify(response.body)).not.toContain('private collection');
  });

  it('maps mongoose validation errors to safe field details', () => {
    const validationError = new mongoose.Error.ValidationError();
    validationError.addError('phone', new mongoose.Error.ValidatorError({
      message: 'Telefone inválido.',
    }));

    const response = handle(validationError);

    expect(response.statusCode).toBe(422);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { phone: 'Telefone inválido.' },
    });
  });

  it('maps zod validation paths to field details', () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'undefined',
        path: ['body', 'guestPhone'],
        message: 'Telefone obrigatório.',
      },
    ]);

    const response = handle(zodError);

    expect(response.statusCode).toBe(422);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { guestPhone: 'Telefone obrigatório.' },
    });
  });

  it.each([
    [new mongoose.Error.CastError('ObjectId', 'id-inválido', '_id'), 400, 'INVALID_IDENTIFIER'],
    [new multer.MulterError('LIMIT_FILE_SIZE'), 413, 'UPLOAD_TOO_LARGE'],
    [new jwt.JsonWebTokenError('invalid token'), 401, 'UNAUTHORIZED'],
  ])('maps known infrastructure errors to safe responses', (error, statusCode, code) => {
    const response = handle(error);

    expect(response.statusCode).toBe(statusCode);
    expect(response.body).toMatchObject({ code, requestId: 'request-test-123' });
  });

  it('hides internal error details from an unexpected exception', () => {
    const response = handle(new Error('mongodb://secret-user:secret-password@host'));

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({
      message: 'Ocorreu um erro inesperado. Tente novamente mais tarde.',
      code: 'INTERNAL_ERROR',
      requestId: 'request-test-123',
    });
    expect(JSON.stringify(response.body)).not.toContain('secret-password');
  });
});
