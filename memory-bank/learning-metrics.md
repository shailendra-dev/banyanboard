# Learning Metrics

## Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| Max learned rule files | 10 | Hard cap on files in `agent-rules/_learned/` |
| Expiry period (days) | 90 | Remove unreinforced bullets after this period |
| Promotion threshold | 3 | Promote to `medium` priority at this evidence count |
| Max bullets per file | 15 | Prune to 10 most-evidenced when exceeded |

## Task History

| Task ID | Date | Learnings Extracted | Rules Amended | Rules Created |
|---------|------|--------------------:|-------------:|-------------:|
| TASK-001 | 2026-04-30 | 4 | 0 | 3 |

## Rule Effectiveness

| File | Topics | Evidence Count | Priority | Last Updated |
|------|--------|---------------:|:--------:|:------------:|
| testing-patterns.md | testing, otel, observability | 2 | low | 2026-04-30 |
| architecture.md | architecture, eslint, module-ownership | 1 | low | 2026-04-30 |
| error-handling.md | error-handling, typescript | 1 | low | 2026-04-30 |

## Consolidation History

| Date | Rules Before | Rules After | Merged | Expired | Promoted |
|------|------------:|------------:|-------:|--------:|---------:|
| 2026-04-30 | 3 | 3 | 0 | 0 | 0 |
