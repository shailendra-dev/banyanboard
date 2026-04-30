import { type ErrorRequestHandler } from 'express';
import { AppError } from '../errors/AppError.js';
import { getLogger, getTraceId } from '../logger/index.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const log = getLogger();
  const traceId = getTraceId();

  if (err instanceof AppError) {
    const level = err.statusCode >= 500 ? 'error' : 'warn';
    log[level]({ err, code: err.code, statusCode: err.statusCode }, err.message);
    const body: Record<string, unknown> = {
      code: err.code,
      message: err.expose ? err.message : 'Internal Server Error',
      traceId,
    };
    if (err.details !== undefined) {
      body['details'] = err.details;
    }
    res.status(err.statusCode).json({ error: body });
  } else {
    log.error({ err }, 'Unhandled programmer error');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal Server Error',
        traceId,
      },
    });
  }
};
