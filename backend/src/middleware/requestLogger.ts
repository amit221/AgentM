import type { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

function getClientIp(req: Request): string | undefined {
  const xf = (req.headers['x-forwarded-for'] as string | undefined) || '';
  if (xf) return xf.split(',')[0]?.trim();
  return req.ip || req.socket?.remoteAddress || undefined;
}

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const requestId = (res.locals && res.locals.requestId) as string | undefined;
  const log = logger.child({ requestId });

  const clientIp = getClientIp(req);
  const ua = (req.headers['user-agent'] as string | undefined) || '';

  // Basic request start log (avoid logging full bodies)
  log.info('Incoming request', {
    method: req.method,
    path: req.originalUrl || req.url,
    clientIp,
    userAgent: ua,
    contentLength: req.headers['content-length'],
  });

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const status = res.statusCode;
    log.info('Request completed', {
      method: req.method,
      path: req.originalUrl || req.url,
      status,
      durationMs,
      responseLength: res.getHeader('content-length'),
    });
  });

  res.on('close', () => {
    // In case the connection was terminated early
    const durationMs = Date.now() - start;
    if (!res.writableEnded) {
      log.warn('Request closed before response ended', {
        method: req.method,
        path: req.originalUrl || req.url,
        durationMs,
      });
    }
  });

  next();
}


