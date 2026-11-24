import type { Request, Response, NextFunction } from 'express';
import { logError, logInfo, logWarn } from '../logger.js';

/**
 * Access log. Uses the shared logger so the status icon degrades to a plain
 * ASCII tag on consoles that cannot encode emoji (each emoji became `?`).
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const message = `${req.method} ${req.path} -> ${res.statusCode} (${duration}ms)`;
    if (res.statusCode >= 500) logError('HTTP', message);
    else if (res.statusCode >= 400) logWarn('HTTP', message);
    else logInfo('HTTP', message);
  });
  next();
}
