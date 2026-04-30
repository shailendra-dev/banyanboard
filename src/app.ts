import express from 'express';
import { traceContextMiddleware } from './middleware/traceContext.js';
import { requestLoggerMiddleware } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { healthRouter } from './routes/health.js';

export function createApp(): express.Application {
  const app = express();

  app.use(traceContextMiddleware);
  app.use(express.json({ limit: '100kb' }));
  app.use(requestLoggerMiddleware);
  app.use(healthRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
