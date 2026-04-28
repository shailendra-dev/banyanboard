# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Memory Bank System

This project uses the **Banyan Memory Bank** system for structured development and task management. All Memory Bank files are located in the `memory-bank/` directory at the project root.

### Core Memory Bank Files

- **`memory-bank/tasks.md`** - Task registry: at-a-glance table of all tasks with phase and status
- **`memory-bank/tasks/TASK-XXX.md`** - Per-task file: full plan, user journey, implementation roadmap, and live execution state for one task
- **`memory-bank/progress.md`** - Implementation status and phase completion tracking (only updated by the banyan-archive command)
- **`memory-bank/projectConfig.md`** - Plugin version tracking and project configuration (auto-managed by `/banyan-init`)
- **`memory-bank/projectbrief.md`** - Project foundation, objectives, and repository structure
- **`memory-bank/productBrief.md`** - Product context: key functionality, markets, personas, NFRs, and integrations
- **`memory-bank/techContext.md`** - Technology stack, infrastructure, component structure, and development commands
- **`memory-bank/systemPatterns.md`** - System architecture patterns
- **`memory-bank/roadmap.md`** - Product roadmap with versions, features, and release tracking (required for Level 2-4 tasks)
- **`memory-bank/creative/TASK-XXX-[feature].md`** - Design decisions, prefixed with task ID
- **`memory-bank/reflection/reflection-[task].md`** - Task reviews and learnings
- **`memory-bank/archive/archive-[task].md`** - Completed task archives

### Memory Bank Workflow

When starting work:
1. **Read `memory-bank/tasks.md`** to see all active tasks and their phases
2. **Read `memory-bank/tasks/TASK-XXX.md`** for the specific task you are working on — this contains the full plan and current execution state
3. Consult `memory-bank/techContext.md` for project-specific commands and component structure
4. **Read `memory-bank/productBrief.md`** to understand product context, personas, and NFRs (especially for Level 2-4 tasks)
5. Consult task-specific creative or reflection docs if they exist

When working:
- Update `memory-bank/tasks/TASK-XXX.md` Execution State section as you complete work items or phases; update the `tasks.md` registry row to reflect Phase and Status
- Update `memory-bank/techContext.md` when adding new technologies, libraries, or infrastructure
- Update `memory-bank/systemPatterns.md` when introducing new architectural or design patterns (should be done by Document subagent during build iterations)
- Update `memory-bank/productBrief.md` when adding features, personas, or changing NFRs (should be done by Document subagent during build iterations)
- Follow the complexity-appropriate workflow (see below)

### 12-Factor App Principles

This project follows [12-Factor App](https://12factor.net/) methodology. Key principles enforced during `/build`:

- **Config in Environment** - Store configuration in environment variables, not code
- **No Hardcoded Values** - URLs, credentials, feature flags, and settings must be configurable
- **Dev/Prod Parity** - Use the same configuration approach across all environments

**Detailed instructions** are in the build sub-agent files (`${CLAUDE_PLUGIN_ROOT}/context/agents/build-*.md`) which are loaded during `/banyan-build` execution. This keeps context lean until needed.

### Observability Standards

This project enforces **consistent observability** across all services using OpenTelemetry standards. Key principles enforced during `/build`:

- **OpenTelemetry First** - Use OpenTelemetry SDK for logs, metrics, and traces
- **Distributed Tracing Always** - Every request must have a traceable transaction ID (W3C Trace Context)
- **Structured Logging** - JSON format with traceId, spanId, service, level fields
- **Configuration Over Code** - All observability settings via environment variables (LOG_LEVEL, OTEL_*, etc.)
- **Reusable Abstractions** - Use common logger library across services

**Environment Variables:**
| Variable | Purpose |
|----------|---------|
| `LOG_LEVEL` | Log verbosity (trace/debug/info/warn/error/fatal) |
| `LOG_FORMAT` | Output format (json/text) |
| `LOG_OUTPUT` | Destination (stdout/file/both) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector endpoint |
| `OTEL_SERVICE_NAME` | Service identifier for traces |
| `OTEL_TRACES_SAMPLER_ARG` | Sampling ratio for production |

**Blocking Violations:**
- `console.log`/`console.error` in production code
- Missing trace context propagation in HTTP clients
- Sensitive data in logs (passwords, tokens, PII)
- Hardcoded log levels or output destinations

**Detailed requirements** are in `${CLAUDE_PLUGIN_ROOT}/context/observability-requirements.md` which is loaded by build agents during `/banyan-build` execution.

### Complexity Levels

Tasks are classified into 4 complexity levels. Complexity is evaluated:
- During `/banyan-task` for quick tasks
- During `/banyan-roadmap feature create` for features (stored with feature, inherited by linked tasks)
- The `/banyan-archive` command should always be used to clean up the environment and get ready for the next development task

See `${CLAUDE_PLUGIN_ROOT}/context/complexity-evaluation.md` for the shared decision tree.

- **Level 1**: Quick fixes, simple bugs
  - Workflow: `/banyan-task` -> `/banyan-build` -> (optional: `/banyan-reflect`) -> `/banyan-archive`
  - Does NOT require roadmap feature

- **Level 2**: Simple enhancements
  - Workflow: `/banyan-roadmap feature create` -> `/banyan-plan` -> `/banyan-build` -> (optional: `/banyan-reflect` -> `/banyan-archive`)
  - Requires roadmap feature

- **Level 3**: Intermediate features
  - Workflow: `/banyan-roadmap feature create` -> `/banyan-plan` -> `/banyan-creative` -> `/banyan-build` (per phase) -> `/banyan-reflect` -> `/banyan-archive`
  - Requires roadmap feature

- **Level 4**: Enterprise/architectural changes
  - Workflow: `/banyan-roadmap feature create` -> `/banyan-plan` -> `/banyan-creative` -> `/banyan-build` (per phase) -> `/banyan-reflect` -> `/banyan-archive`
  - Requires roadmap feature

**Key Notes:**
- **Complexity is stored with features**: When creating a feature in the roadmap, complexity is evaluated and stored. Tasks linked to features inherit this complexity.
- **Level 1 uses `/banyan-task`**: Quick tasks bypass the roadmap entirely
- **Level 2-4 use roadmap features**: Create the feature first, then plan and build
- **Reflection is manual**: Run `/banyan-reflect` after all `/banyan-build` phases complete
- **Git commits**: Phase commits in `/banyan-build`, reflection commit in `/banyan-reflect`
- **Archive strategy**: Configured in `projectbrief.md` Git Configuration. Either `push-and-pr` (pushes feature branch + creates PR) or `local-merge` (merges to main locally). These are mutually exclusive.

The current task's complexity level is documented in `memory-bank/tasks/TASK-XXX.md` (inherited from the linked roadmap feature for Level 2-4).

### Product Brief

The **productBrief.md** file captures the business and product context that all agents need to understand. It ensures implementations align with product intentions.

#### Key Sections

| Section | Purpose |
|---------|---------|
| **Product Overview** | Name, value proposition, product type, stage |
| **Key Functionality** | Core capabilities the product provides |
| **Markets Serviced** | Target industries, geographic focus, market size |
| **Competitive Landscape** | Competitors and differentiators |
| **Key Personas** | Primary users, secondary users, administrators with goals and pain points |
| **User Flows** | Primary flows, onboarding, key workflows |
| **Success Metrics** | Business, product, and technical KPIs |
| **Non-Functional Requirements** | Performance, scalability, security, availability, accessibility, i18n |
| **Integration Points** | External systems, APIs consumed/provided |
| **Constraints & Risks** | Business/technical constraints, assumptions, risks |

#### When to Use

- **Planning (Level 2-4)**: Read to understand user needs and constraints before planning
- **Creative phases**: Architecture, UI/UX, and algorithm decisions MUST align with productBrief
- **Build phase**: Documentation agent updates productBrief when capabilities change

#### Memory Bank Refresh

When running `/banyan-init` on existing repos, a Product Brief Refresh agent reviews the codebase and updates productBrief.md with any changes to:
- New features or capabilities
- New user personas or roles
- Changed non-functional requirements
- New integrations

### Product Roadmap Management

The project uses a **version-based roadmap** system for tracking features and releases.

#### Roadmap Structure

```
memory-bank/roadmap.md
├── Summary (statistics)
├── Versions
│   ├── next (planning) - Backlog for future features
│   ├── vX.X.X (active) - Currently being worked on
│   └── vX.X.X (released) - Deployed, LOCKED
└── Features
    └── FEAT-XXX: Feature Name
        ├── Version assignment
        ├── Status (planned/in_progress/complete)
        ├── Complexity (Level 1-4) - Evaluated at feature creation
        └── Linked tasks (inherit feature complexity)
```

#### Version Lifecycle

1. **planning** - Accepting features, no timeline commitment
2. **active** - Feature list frozen, target date set
3. **released** - Deployed, **permanently locked** (no feature changes)

#### Feature Linking (Mandatory for Level 2-4)

During `/banyan-plan`, tasks must be linked to roadmap features:
- **Level 1**: Optional (can skip roadmap linking)
- **Level 2-4**: Mandatory (prompts to select or create feature)

When linked, tasks get:
```markdown
**Roadmap Link**: FEAT-005
**Feature Branch**: feature/FEAT-005-newsletter-distribution
```

#### Feature-Based Git Branches

When a task has a roadmap link:
- **Branch**: `feature/FEAT-XXX-slug` (not `feature/task-XXX`)
- **Worktree**: `.claude-worktrees/FEAT-XXX` (feature-based)
- **Sharing**: Multiple tasks can share the same feature worktree

Without a roadmap link (Level 1 or opted-out):
- **Branch**: `feature/task-XXX` (current behavior)
- **Worktree**: `.claude-worktrees/task-XXX`

#### Release Locking

Released versions are **permanently locked**:
- Cannot add features to released versions
- Cannot remove features from released versions
- Cannot move features to/from released versions

This preserves release history and prevents accidental modifications.

#### /banyan-roadmap Command Quick Reference

| Operation | Command |
|-----------|---------|
| View roadmap | `/banyan-roadmap` |
| Create feature | `/banyan-roadmap feature create [name]` |
| Move feature | `/banyan-roadmap feature move FEAT-001 v1.0.0` |
| Link task | `/banyan-roadmap feature link FEAT-001 TASK-001` |
| Create version | `/banyan-roadmap version create v1.0.0` |
| Activate version | `/banyan-roadmap version activate v1.0.0` |
| Release version | `/banyan-roadmap version release v1.0.0` |

### Progressive Discovery

Do not attempt to load all Memory Bank files at once. Use **progressive discovery**:
1. Start with `tasks.md` and the relevant `tasks/TASK-XXX.md`
2. Load other files as needed based on the task
3. Check for task-specific creative or archive docs if referenced

### Interruption Recovery System

All workflow commands include automatic resumption logic. The `## Execution State` section of `tasks/TASK-XXX.md` is continuously updated with current phase, step, sub-agent statuses, and resumption notes. Commands check this state on startup and resume from the last incomplete step. See command files for step-by-step state tracking requirements.

### Phase Gates & Reference Integrity

Commands enforce workflow prerequisites before proceeding. These are **hard blocks** — the command will STOP with an error and suggested fix if prerequisites are not met. There is no skip option; use `/banyan-task` for quick work that doesn't need the full workflow.

**Phase Gates (hard blocks):**

| Command | Key Preconditions |
|---------|-------------------|
| `/banyan-plan` | Task registered in tasks.md |
| `/banyan-creative` | Plan exists, complexity >= Level 2 |
| `/banyan-build` | Plan exists, required creative phases complete |
| `/banyan-reflect` | Build phase completed |
| `/banyan-archive` | Reflection document exists (Task Archive mode) |
| `/banyan-verify` | Implementation present (when TASK-XXX provided) |

**Reference Integrity (fail-fast):**

When a command reads a reference to another file (e.g., a task listed in `tasks.md`, a creative doc marked complete in a task file), it verifies the referenced file exists. If a reference is broken, the command stops immediately with an error and suggested fix — it does not silently continue with partial state.

Common reference checks:
- `tasks.md` registry → `tasks/TASK-XXX.md` file
- Task file creative phases → `creative/TASK-XXX-*.md` files
- Task file reflection status → `reflection/reflection-TASK-XXX.md`
- `roadmap.md` task references → `tasks.md` registry

**Exempt commands**: `/banyan-init` and `/banyan-upgrade` skip all gates (they bootstrap state).

Validation logic: `${CLAUDE_PLUGIN_ROOT}/context/phase-gates.md`

### Claude Commands (Slash Commands)

This project uses structured workflow commands with **progressive context loading** to optimize token usage.

**Commands:** `${CLAUDE_PLUGIN_ROOT}/commands/`
| Command | Description | When to Use |
|---------|-------------|-------------|
| `/banyan-init` | Memory Bank setup | Initialize Memory Bank for a new project |
| `/banyan-task` | Quick task execution | Level 1 tasks (bug fixes, typos, simple changes) |
| `/banyan-roadmap` | Product roadmap management | Create features, manage versions (includes complexity evaluation) |
| `/banyan-plan` | Task planning | Level 2-4 tasks after feature creation |
| `/banyan-creative` | Design decisions | Level 3-4 tasks requiring design exploration |
| `/banyan-build` | Code implementation | After planning/creative phases; one phase at a time |
| `/banyan-reflect` | Task reflection | After all /banyan-build phases complete |
| `/banyan-archive` | Task archiving + PR creation | After /banyan-reflect completes (mandatory for Level 4) |
| `/banyan-verify` | Code verification & testing | Ad-hoc verification at any time |

### Command Task ID Argument

All workflow commands require a task ID argument to support parallel task development:

```
/banyan-plan TASK-001
/banyan-creative TASK-001
/banyan-build TASK-001
/banyan-reflect TASK-001
/banyan-archive TASK-001
```

Use `/banyan-roadmap view` to see all tasks and their current phases.

**Workflow by Complexity:**
- **Level 1:** `/banyan-task` -> `/banyan-build TASK-XXX` -> `/banyan-reflect TASK-XXX` (optional) -> `/banyan-archive TASK-XXX`
- **Level 2:** `/banyan-roadmap feature create` -> `/banyan-plan TASK-XXX` -> `/banyan-build TASK-XXX` -> `/banyan-reflect TASK-XXX` (optional) -> `/banyan-archive TASK-XXX`
- **Level 3:** `/banyan-roadmap feature create` -> `/banyan-plan TASK-XXX` -> `/banyan-creative TASK-XXX` -> `/banyan-build TASK-XXX` (per phase) -> `/banyan-reflect TASK-XXX` -> `/banyan-archive TASK-XXX`
- **Level 4:** `/banyan-roadmap feature create` -> `/banyan-plan TASK-XXX` -> `/banyan-creative TASK-XXX` -> `/banyan-build TASK-XXX` (per phase) -> `/banyan-reflect TASK-XXX` -> `/banyan-archive TASK-XXX`

**Multi-Phase Implementation Workflow:**

For tasks with multiple implementation phases (common in Level 3-4):

```
/banyan-roadmap feature create -> /banyan-plan -> /banyan-creative
    |
    v
    Phase 1: /banyan-build -> STOP (human reviews)
    |
    v
    Phase 2: /banyan-build -> STOP (human reviews)
    |
    v
    Phase N: /banyan-build -> STOP (human reviews)
    |
    v
    /banyan-reflect (create reflection document + commit)
    |
    v
    /banyan-archive (push & PR, or local merge - based on project config)
```

**What Happens in Each Command:**
- **/banyan-build**: Implements ONE phase, commits to feature branch, STOPS
- **/banyan-reflect**: Creates reflection document, commits to feature branch
- **/banyan-archive**: Either pushes feature branch + creates PR, or merges to main locally (configured per project)

**Key Points:**
- `/banyan-build` works on ONE implementation phase at a time
- After each `/banyan-build`, human reviews before proceeding
- `/banyan-reflect` is run MANUALLY after all phases complete
- `/banyan-archive` uses the **Archive Strategy** from `projectbrief.md` to decide between push+PR or local merge (never both)

### Progressive Context Loading

Commands use a **two-tier system** to minimize token usage: **command files** (`${CLAUDE_PLUGIN_ROOT}/commands/`) contain minimal routing logic, while **context files** (`${CLAUDE_PLUGIN_ROOT}/context/`) contain detailed instructions loaded only when needed. Each command tells you which context file to read based on the complexity level in `memory-bank/tasks/TASK-XXX.md`.

### Model Selection Strategy

Different commands and sub-agents use different Claude models optimized for cost and performance. See `${CLAUDE_PLUGIN_ROOT}/context/model-selection-strategy.md` for details. Key principle: Haiku for simple tasks, Sonnet for coding, Opus for complex planning/architecture.

### Sub-Agent Architecture

The `/banyan-plan`, `/banyan-creative`, and `/banyan-build` commands use **sub-agent delegation** to prevent context window overflow. Each command spawns specialized sub-agents via the Task tool, with full methodology files in `${CLAUDE_PLUGIN_ROOT}/agents/`. Sub-agents work independently and write outputs to `memory-bank/`. See the respective command files for details.

**Planning agents:**
- **Spec Writer Agent** (Sonnet for L2-L3, Opus for L4) — Reads product context and codebase, generates feature specification with invocation method, success criteria, and acceptance criteria. Replaces manual Q&A with an agent-drafted spec for human review.

### Process Management for Parallel Agents

When multiple agents run in parallel, they MUST use PID-based process control (never pattern-based kills like `pkill -f`). See `${CLAUDE_PLUGIN_ROOT}/context/process-management.md` for details.

### Tool Usage Rules

Claude Code and all sub-agents MUST follow these rules to avoid unnecessary permission prompts and keep the workflow smooth:

**File creation:**
- **NEVER** use `cat << EOF`, `cat << 'EOF'`, or `echo >` heredocs in Bash to create or write files. Use the **Write** tool instead.
- **NEVER** use `sed`, `awk`, or stream editors to modify files. Use the **Edit** tool instead.

**Bash commands — ONE command per Bash call:**
- **NEVER chain independent commands with `&&`, `;`, or `||`** in a single Bash call. Each command MUST be a separate Bash tool call.
- **NEVER prefix a command with `cd dir &&`**. Instead, use absolute paths, `-chdir` flags, or the `-C` flag (e.g., `git -C /path/to/repo status`).
- When you need to create a file and then run a command on it, use **two separate tool calls**: a Write call to create the file, then a Bash call to run the command.
- Do not pipe file contents through Bash when a dedicated tool exists (e.g., use Read instead of `cat`, Grep instead of `grep`).
- Independent commands in separate Bash calls can run in **parallel**, which is faster than chaining.

```
BAD (chained — triggers permission prompt, blocks execution):
  Bash: cd /project && terraform -chdir=modules/lambda test 2>&1 && terraform -chdir=modules/sns test 2>&1

GOOD (separate calls — each matches permission patterns, can run in parallel):
  Bash call 1: terraform -chdir=/project/modules/lambda test 2>&1
  Bash call 2: terraform -chdir=/project/modules/sns test 2>&1

BAD (cd && git — triggers "compound commands with cd and git require approval"):
  Bash: cd /path/to/repo && git status | grep -E "modified:|new file:"

GOOD (git -C flag — matches Bash(git -C *) permission pattern):
  Bash: git -C /path/to/repo status | grep -E "modified:|new file:"

BAD (cd && npm — doesn't match Bash(npm *)):
  Bash: cd /path/to/project && npm test 2>&1

GOOD (use absolute path or run from correct directory):
  Bash: npm test --prefix /path/to/project 2>&1
```

**Why this matters:**
- Permission patterns like `Bash(terraform *)` only match commands that **start with** `terraform`. A chained command like `cd dir && terraform test` starts with `cd`, so it matches nothing and triggers a manual approval prompt.
- Single-purpose commands match the pre-approved permission patterns in `.claude/settings.local.json`
- Heredocs and chained commands look like arbitrary shell execution to the permission system
- This keeps both sequential and parallel workflows flowing without human interruption

**Preserve output from expensive commands — never discard and re-run:**
- When running commands that are slow (>30s), expensive, or produce diagnostic output you may need to analyze (test suites, builds, linters, infrastructure commands), **always `tee` the full output to a log file**.
- **NEVER** pipe long-running command output through `tail`, `head`, `grep`, or other filters that discard the full output. If you need a summary, tee first and then read/grep the log file separately.
- Use `.claude-logs/` at the project root for log files. Create the directory if it doesn't exist. Name files descriptively: `.claude-logs/{command}-{timestamp}.log` (e.g., `.claude-logs/terraform-test-20260314-1423.log`).
- After the command completes, use Read or Grep on the log file for analysis — do not re-run the command.
- Clean up `.claude-logs/` at the end of each `/banyan-build` or `/banyan-archive` cycle, or when log files are no longer needed.
- Add `.claude-logs/` to `.gitignore` if not already present.

```
BAD (output lost — must re-run 8-minute test to see failures):
  Bash: terraform -chdir=/project test 2>&1 | tail -5

GOOD (full output preserved, summary still visible):
  Bash: mkdir -p .claude-logs
  Bash: terraform -chdir=/project test 2>&1 | tee .claude-logs/terraform-test-20260314-1423.log | tail -20
  # Later, to analyze failures:
  Grep: pattern="FAIL\|Error\|failed" path=".claude-logs/terraform-test-20260314-1423.log"

GOOD (background command with full capture):
  Bash (run_in_background): terraform -chdir=/project test 2>&1 | tee .claude-logs/terraform-test-20260314-1423.log
  # When notified of completion, read the log:
  Read: .claude-logs/terraform-test-20260314-1423.log
```

**Why this matters:**
- Re-running a command just to see its output wastes minutes of wall-clock time and burns tokens/compute for zero new information.
- Captured logs enable parallel analysis — you can grep for different failure patterns without waiting for another full run.
- This is especially critical for infrastructure tests (Terraform, integration suites) where a single run can take 5-15+ minutes.

### Continuous Learning System

This project uses **automatic pattern extraction** from task reflections to improve future tasks.

**How it works:**
1. After `/banyan-reflect`, actionable learnings are extracted into `memory-bank/agent-rules/_learned/` as low-priority agent rules
2. Rules are organized by **topic** (e.g., `error-handling.md`, `testing-patterns.md`) — not per-task
3. New learnings amend existing topic files when possible (consolidate-first)
4. Rules are automatically loaded by sub-agents via the standard agent-rules system
5. Rules reinforced across multiple tasks are promoted to higher priority
6. Rules never reinforced expire after 90 days
7. During `/banyan-archive`, consolidation merges overlapping rules and prunes stale ones

**Files:**
- `memory-bank/agent-rules/_learned/*.md` - Auto-generated rules (topic-scoped, terse bullet directives)
- `memory-bank/learning-log.md` - Chronological record of all learning events
- `memory-bank/learning-metrics.md` - Configuration and effectiveness tracking

**For humans:**
- Auto-generated rules start at `low` priority — they never override your human-authored rules
- Review `learning-log.md` periodically to see what the system is learning
- Promote useful rules by changing their priority to `medium` or `high`
- Delete incorrect rules by removing the file (or specific bullets) and running `/banyan-rules-index`
- Adjust thresholds in `learning-metrics.md` Configuration section
- Max 10 learned rule files enforced — the system consolidates aggressively to prevent sprawl

### User-Supplied Agent Rules

Projects can define custom agent rules in `memory-bank/agent-rules/` that get loaded contextually based on file patterns, paths, or topics.

**Directory Structure:**
```
memory-bank/
├── agent-rules/                    # User-created rule files
│   ├── base-standards.md           # globs: ["**/*"], priority: high
│   ├── typescript.md               # globs: ["*.ts", "*.tsx"]
│   ├── testing.md                  # globs: ["*.test.*"]
│   └── [module]-rules.md           # paths: ["src/[module]/"]
└── agent-rules-index.md            # Auto-generated by /banyan-rules-index
```

**Rule File Format:**
```markdown
---
name: TypeScript Standards
globs: ["*.ts", "*.tsx"]
paths: ["src/"]
topics: ["typescript", "frontend"]
priority: medium  # low | medium | high | critical
---

# Your instructions here...
```

**How It Works:**
1. Run `/banyan-rules-index` to scan rules and generate the index
2. `/banyan-plan`, `/banyan-creative`, and `/banyan-build` auto-check if reindex is needed
3. Sub-agents load matching rules based on files they're working on
4. Higher priority rules win on conflicts

**Priority Levels:**
| Level | Use Case |
|-------|----------|
| `low` | General suggestions |
| `medium` | Language/domain standards (default) |
| `high` | Project-specific overrides |
| `critical` | Security/compliance requirements |

**Index Validation:**
- Detects context overload (too many rules matching same files)
- Detects conflicts between rules
- **Rejects unsafe rules** (non-dev instructions, prompt injection attempts)

**Full documentation**: See `${CLAUDE_PLUGIN_ROOT}/docs/agent-rules-examples.md`

