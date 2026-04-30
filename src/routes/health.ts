import { Router } from 'express';
import * as db from '../db/index.js';
import { config } from '../config/index.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res, next) => {
  db.ping()
    .then((alive) => {
      if (alive) {
        res.status(200).json({
          status: 'ok',
          service: config.SERVICE_NAME,
          version: config.SERVICE_VERSION,
          db: 'connected',
        });
      } else {
        res.status(503).json({
          status: 'degraded',
          service: config.SERVICE_NAME,
          version: config.SERVICE_VERSION,
          db: 'disconnected',
        });
      }
    })
    .catch(next);
});
