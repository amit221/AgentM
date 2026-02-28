import logger from './utils/logger';
import app from './app';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

const server = app.listen(PORT, () => {
  logger.info('Backend listening', { url: `http://localhost:${PORT}`, port: PORT, env: process.env.NODE_ENV || 'development' });
});

// Set server timeout to 6 minutes to allow for 5-minute operations
server.timeout = 360000; // 6 minutes
server.keepAliveTimeout = 360000; // 6 minutes


