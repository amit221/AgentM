import express from 'express';
import cors, { CorsOptions } from 'cors';
import agentRouter from './v1/agent.routes';
import spreadsheetRouter from './v1/spreadsheet.routes';
import chartRouter from './v1/chart.routes';
import metadataRouter from './v1/metadata.routes';
import { getAIServiceManager } from './services/manager';

import dotenv from 'dotenv';
import logger from './utils/logger';
import { requestIdMiddleware } from './middleware/requestId';
import { requestLoggingMiddleware } from './middleware/requestLogger';

dotenv.config();

const app = express();

const corsEnv = (process.env.CORS_ORIGIN || '').trim();
let corsOptions: CorsOptions = {
  origin: true,
  credentials: true
};
if (corsEnv) {
  const origins = corsEnv.split(',').map((s) => s.trim()).filter(Boolean);
  const originConfig: boolean | string | RegExp | (string | RegExp)[] = origins.includes('*') ? true : origins;
  corsOptions = {
    origin: originConfig,
    credentials: true
  };
  logger.info('CORS configured from CORS_ORIGIN', { CORS_ORIGIN: corsEnv });
} else {
  logger.info('CORS defaulting to open origin ("*") because CORS_ORIGIN not set');
}
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));
app.use(requestIdMiddleware);
app.use(requestLoggingMiddleware);

app.get('/', (_req, res) => {
  res.json({ ok: true });
});
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});
app.get('/api', (_req, res) => {
  res.json({ ok: true });
});
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/v1/agent', agentRouter);
app.use('/api/v1/spreadsheet', spreadsheetRouter);
app.use('/api/v1/chart', chartRouter);
app.use('/api/v1/metadata', metadataRouter);

app.use('/v1/agent', agentRouter);
app.use('/v1/spreadsheet', spreadsheetRouter);
app.use('/v1/chart', chartRouter);
app.use('/v1/metadata', metadataRouter);

const manager = getAIServiceManager();
const status = manager.initializeFromEnv();
logger.info('AI service manager initialized', status);
logger.info('Server ready');

app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const requestId = (res.locals && (res.locals as any).requestId) as string | undefined;
  logger.error('Unhandled error', {
    requestId,
    method: req.method,
    path: req.originalUrl || req.url,
    error: err?.message || String(err),
    stack: err?.stack,
  });
  res.status(500).json({ error: 'Internal server error', requestId });
});

export default app;
