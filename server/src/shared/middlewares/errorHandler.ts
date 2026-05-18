import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { logger } from '../utils/logger';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
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
    res.status(409).json({ message: messageMap[field] ?? `Já existe um cadastro com este ${field}.` });
    return;
  }

  // Handle Mongoose Validation Error
  if (err.name === 'ValidationError') {
    const message = Object.values((err as any).errors).map((val: any) => val.message).join(', ');
    res.status(422).json({ message });
    return;
  }

  // Handle Mongoose CastError (invalid ID)
  if (err.name === 'CastError') {
    res.status(400).json({ message: `Formato de ID inválido: ${(err as any).value}` });
    return;
  }
  
  logger.error({ err, stack: err.stack }, 'Unhandled exception');
  res.status(500).json({ message: 'Erro interno no servidor' });
}
