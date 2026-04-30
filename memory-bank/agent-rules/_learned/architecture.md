---
name: "Learned: Architecture Patterns"
globs: ["src/**/*.ts"]
topics: ["architecture", "eslint", "module-ownership"]
priority: low
evidence_count: 1
last_updated: 2026-04-30
auto_generated: true
---

# Architecture Patterns

- When ESLint ownership rules restrict an import to a specific directory, use a re-export shim in the consumer directory to maintain the expected import path without relaxing the rule.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| ESLint ownership + re-export shim pattern | [reflection-TASK-001.md](../reflection/reflection-TASK-001.md) | 2026-04-30 |
