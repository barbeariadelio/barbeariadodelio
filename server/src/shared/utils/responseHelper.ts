import { Response } from 'express';

export function ok<T>(res: Response, data: T, message?: string): void {
  res.json({ data, message });
}

export function created<T>(res: Response, data: T): void {
  res.status(201).json({ data });
}
