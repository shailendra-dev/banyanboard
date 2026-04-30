/**
 * Request-logger middleware re-export.
 *
 * The actual middleware is created in src/logger/http.ts (which owns pino/pino-http).
 * This module re-exports it under the middleware/ namespace for use in createApp().
 */

export { requestLoggerMiddleware } from '../logger/http.js';
