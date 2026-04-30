# Project Brief

## Project Overview

[To be defined]

## Goals

[To be defined]

## Repository Structure

- **Type**: Poly-repo
- **Workspace Tool**: None
- **Workspace Root**: N/A

## Git Configuration

- **Repository**: No
- **Provider**: None
- **CLI Available**: none
- **Remote URL**: none
- **Default Branch**: main
- **Archive Strategy**: local-merge

## Security Debt (Auto-Generated)

### Dependency Upgrade: vitest + @vitest/coverage-v8
- **Current Version**: ^2.1.9
- **Target Version**: ^4.x
- **Security Issue**: GHSA-4w7w-66w2-5vf9 (Vite path traversal via optimized dep .map handling), GHSA-67mh-4wv8-2f99 (esbuild dev-server CORS bypass)
- **Scope**: vitest.config.ts, all tests/**/*.test.ts files
- **Breaking Changes**: Yes — Vitest 3 and 4 have API changes; review migration guide before upgrading
- **Impact**: Dev-only tooling; vulnerabilities affect Vite dev server, not run in production. Risk limited to local developer machines.
- **Recommended Priority**: LOW
- **Generated From**: TASK-001, Phase 1, 2026-04-28

### Dependency Upgrade: uuid (transitive via @opentelemetry/auto-instrumentations-node)
- **Current Version**: <14.0.0
- **Target Version**: >=14.0.0
- **Security Issue**: GHSA-w5hq-g745-h8pq — buffer bounds check in v3/v5/v6 when caller provides a `buf` argument
- **Scope**: Transitive via gaxios → @opentelemetry/auto-instrumentations-node; cannot be forced directly
- **Breaking Changes**: Requires upstream OTel update
- **Impact**: OTel's usage does not pass the `buf` argument; vulnerability is unlikely to trigger in practice
- **Recommended Priority**: LOW
- **Generated From**: TASK-001, Phase 1, 2026-04-28
