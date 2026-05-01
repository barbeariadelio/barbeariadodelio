import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { AppError } from '../errors/AppError';

export function validate(schema: AnyZodObject) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const message = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        next(new AppError(message, 422));
        return;
      }
      next(err);
    }
  };
}
