import './telemetry/index.js';
import { shutdownTelemetry } from './telemetry/index.js';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { getLogger } from './logger/index.js';
import { shutdown as shutdownDb } from './db/index.js';

const app = createApp();
const log = getLogger();

const server = app.listen(config.PORT, () => {
  log.info(
    { port: config.PORT, service: config.SERVICE_NAME, version: config.SERVICE_VERSION },
    'Server started',
  );
});

function gracefulShutdown(signal: string): void {
  log.info({ signal }, 'Received shutdown signal, draining connections');
  server.close((err?: Error) => {
    if (err) {
      log.error({ err }, 'Error closing HTTP server');
    }
    shutdownDb()
      .then(() => shutdownTelemetry())
      .then(() => {
        log.info('Server, database pool, and telemetry closed cleanly');
        process.exit(0);
      })
      .catch((shutdownErr: unknown) => {
        log.error({ err: shutdownErr }, 'Error during shutdown');
        process.exit(1);
      });
  });

  // Force exit if graceful shutdown takes more than 10 seconds.
  setTimeout(() => {
    log.error('Forced shutdown after 10s timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => { gracefulShutdown('SIGTERM'); });
process.on('SIGINT', () => { gracefulShutdown('SIGINT'); });
