import type { Request, Response, NextFunction, RequestHandler } from 'express';
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

/**
 * Express 4 does not forward rejected promises from async handlers, which made a
 * thrown LLM error crash the process. Wrap every async route with this so the
 * failure reaches the error handler instead.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next): void => {
    void handler(req, res, next).catch(next);
  };
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
