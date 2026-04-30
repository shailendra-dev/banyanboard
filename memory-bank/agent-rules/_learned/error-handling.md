---
name: "Learned: Error Handling"
globs: ["src/**/*.ts", "*.ts"]
topics: ["error-handling", "typescript"]
priority: low
evidence_count: 1
last_updated: 2026-04-30
auto_generated: true
---

# Error Handling

- Always call `Object.setPrototypeOf(this, new.target.prototype)` in custom Error subclasses to restore the prototype chain after TypeScript transpilation, ensuring `instanceof` checks work across module boundaries.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| TypeScript Error prototype chain restoration | [reflection-TASK-001.md](../reflection/reflection-TASK-001.md) | 2026-04-30 |
