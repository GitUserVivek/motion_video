import type { Request, Response, NextFunction } from 'express';
import type { ApiError } from '@edumotion/shared';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    const error: ApiError = {
      code: err.code,
      message: err.message,
      details: err.details,
    };
    res.status(err.statusCode).json({ success: false, error });
    return;
  }

  if (err instanceof Error) {
    console.error('[ERROR]', err.message, err.stack);
    const error: ApiError = {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    };
    res.status(500).json({ success: false, error });
    return;
  }

  res.status(500).json({
    success: false,
    error: { code: 'UNKNOWN_ERROR', message: 'Unknown error' },
  });
}
