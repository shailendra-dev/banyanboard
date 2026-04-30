/**
 * HTTP request-logger middleware factory.
 *
 * Lives in src/logger/ because it directly uses pino and pino-http (both owned
 * exclusively by this directory per the ESLint no-restricted-imports rule).
 * Exported as a named factory so createApp() can compose it with the other middleware.
 */

import { pinoHttp } from 'pino-http';
import type { LevelWithSilent } from 'pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from './index.js';

export const requestLoggerMiddleware = pinoHttp<IncomingMessage, ServerResponse>({
  logger,

  // Rename the built-in responseTime field to durationMs.
  customAttributeKeys: {
    responseTime: 'durationMs',
  },

  // Include headers so pino's redact paths can censor Authorization/Cookie values.
  serializers: {
    req: (req: IncomingMessage) => ({
      method: req.method,
      url: req.url,
      headers: req.headers,
    }),
    res: (res: ServerResponse) => ({
      statusCode: res.statusCode,
    }),
  },

  // Map HTTP status codes to log levels: 5xx → error, 4xx → warn, rest → info.
  customLogLevel: (
    _req: IncomingMessage,
    res: ServerResponse,
    err?: Error,
  ): LevelWithSilent => {
    if (err !== undefined || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },

  customSuccessMessage: (
    req: IncomingMessage,
    res: ServerResponse,
  ): string => `${req.method ?? 'UNKNOWN'} ${req.url ?? '/'} ${res.statusCode}`,
});
