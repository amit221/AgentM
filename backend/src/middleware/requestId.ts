import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const headerId = (req.headers['x-request-id'] || req.headers['x-correlation-id']) as string | undefined;
  const id = (headerId && String(headerId)) || randomUUID();
  // Store on locals to avoid Request typing augmentation
  res.locals.requestId = id;
  res.setHeader('x-request-id', id);
  next();
}


