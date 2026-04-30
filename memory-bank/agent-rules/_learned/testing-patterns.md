---
name: "Learned: Testing Patterns"
globs: ["tests/**/*.ts", "*.test.ts", "*.spec.ts"]
topics: ["testing", "otel", "observability"]
priority: low
evidence_count: 2
last_updated: 2026-04-30
auto_generated: true
---

# Testing Patterns

- When testing code that reads `trace.getActiveSpan()`, simulate OTel context with `trace.wrapSpanContext(spanCtx)` + `otelContext.with(ctx, () => next())` — do not rely on auto-instrumentation being active in the test environment.
- To assert "no console.log in production source," use `spawnSync('grep', ['-r', '--include=*.ts', 'console\\.', 'src/'])` and assert `status === 1` — making the no-console guarantee a runtime-verifiable contract, not just a linter dependency.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| OTel context simulation in tests | [reflection-TASK-001.md](../reflection/reflection-TASK-001.md) | 2026-04-30 |
| spawnSync grep no-console assertion | [reflection-TASK-001.md](../reflection/reflection-TASK-001.md) | 2026-04-30 |
