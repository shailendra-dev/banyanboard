/**
 * Trace-context middleware — enters the AsyncLocalStorage scope per request.
 *
 * By the time this middleware runs, OTel's HTTP auto-instrumentation has already:
 *   1. Extracted the W3C traceparent header (or generated a new root span).
 *   2. Started a server span and stored it as the active OTel span.
 *
 * This middleware's sole job is to enter an ALS scope so that getLogger() can
 * attach per-request bindings (e.g., userId from auth middleware in FEAT-002)
 * downstream without explicit parameter threading.
 *
 * Middleware order (enforced in createApp):
 *   1. traceContextMiddleware  ← this file (enter ALS scope)
 *   2. express.json()
 *   3. requestLoggerMiddleware
 *   4. routes
 *   5. notFoundHandler
 *   6. errorHandler
 */

import type { RequestHandler } from 'express';
import { runWithContext } from '../logger/index.js';

export const traceContextMiddleware: RequestHandler = (_req, _res, next) => {
  // Run the rest of the request pipeline inside an ALS scope.
  // The scope starts empty; downstream middleware (e.g., auth) may add bindings
  // via the ALS store. getLogger() reads those bindings at call time.
  runWithContext({ bindings: {} }, () => next());
};
