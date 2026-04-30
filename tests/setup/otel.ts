/**
 * Register the OTel AsyncLocalStorage context manager for tests.
 *
 * Without this, @opentelemetry/api uses a NoopContextManager and context.with()
 * does not propagate span context, making trace enrichment tests fail.
 * This file is loaded as a Vitest setup file (see vitest.config.ts).
 */

import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { context } from '@opentelemetry/api';

const contextManager = new AsyncLocalStorageContextManager();
contextManager.enable();
context.setGlobalContextManager(contextManager);
