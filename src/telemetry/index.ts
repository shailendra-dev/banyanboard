/**
 * OpenTelemetry SDK bootstrap for BanyanBoard API.
 *
 * This module MUST be imported before any other module in server.ts so that
 * OTel auto-instrumentation can patch Node.js modules (http, pg) before they
 * are first loaded. Use a top-of-file side-effect import:
 *
 *   import './telemetry/index.js';   // must be first
 *   import { config } from './config/index.js';
 *   // ...rest of imports
 *
 * When OTEL_SDK_DISABLED=true (or via process.env), the SDK is not started:
 * trace.getActiveSpan() still works (returns undefined), so the logger and
 * middleware degrade gracefully without traceId enrichment.
 *
 * The SDK reads standard OTEL_* env vars automatically:
 *   OTEL_EXPORTER_OTLP_ENDPOINT  — OTLP collector URL (optional; no-op if absent)
 *   OTEL_SERVICE_NAME            — service identity for traces
 *   OTEL_TRACES_SAMPLER          — sampler strategy (default: parentbased_traceidratio)
 *   OTEL_TRACES_SAMPLER_ARG      — sampling ratio 0..1 (default: 1.0)
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

// Read directly from process.env — config module is not yet initialized when
// this module loads, and OTEL_SDK_DISABLED controls whether we even start.
const disabled = process.env['OTEL_SDK_DISABLED'] === 'true';

const sdk = new NodeSDK({
  // serviceName falls back to the OTEL_SERVICE_NAME env var, then SERVICE_NAME.
  // If neither is set, NodeSDK uses "unknown_service".
  serviceName:
    process.env['OTEL_SERVICE_NAME'] ??
    process.env['SERVICE_NAME'] ??
    'banyanboard-api',

  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable instrumentation that adds noise without value at our scale.
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-net': { enabled: false },
    }),
  ],
});

if (!disabled) {
  sdk.start();
}

// Drain spans on graceful shutdown. server.ts calls this via SIGTERM/SIGINT
// handlers AFTER the HTTP server stops accepting new connections.
export async function shutdownTelemetry(): Promise<void> {
  if (!disabled) {
    await sdk.shutdown();
  }
}
