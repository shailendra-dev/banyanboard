# Product Roadmap

## Summary

- **Total Features**: 7
- **Total Versions**: 4 (3 planning + `next` backlog)
- **Active Version**: None
- **Released Versions**: 0

## Versions

### next (Backlog)

- **Status**: planning
- **Description**: Unallocated features awaiting prioritization.
- **Features**: None

---

### v0.1.0 (Foundation)

- **Status**: planning
- **Target Date**: TBD
- **Description**: Backend skeleton — Express + TypeScript + PostgreSQL running under Docker Compose with the clean-architecture folder layout in place. No user-facing features yet.
- **Features**:
  - FEAT-001: Express API with TypeScript [Level 3]

---

### v0.2.0 (Auth & Boards)

- **Status**: planning
- **Target Date**: TBD
- **Description**: Multi-user core — users can sign up, log in, create boards, and invite teammates. Boards have memberships but no card content yet.
- **Features**:
  - FEAT-002: Authentication [Level 3]
  - FEAT-003: Boards & Memberships [Level 3]

---

### v0.3.0 (Cards — MVP)

- **Status**: planning
- **Target Date**: TBD
- **Description**: Shippable kanban — boards have columns, columns have cards, cards can be moved by drag-and-drop, and cards carry labels and due dates. This is the first version intended for real users.
- **Features**:
  - FEAT-004: Columns & Cards [Level 3]
  - FEAT-005: Drag-and-Drop [Level 3]
  - FEAT-006: Labels [Level 2]
  - FEAT-007: Due Dates [Level 2]

---

## Features

### FEAT-001: Express API with TypeScript

- **Version**: v0.1.0
- **Status**: in_progress
- **Priority**: high
- **Complexity**: Level 3
- **Description**: Foundation milestone. Set up the Express + TypeScript backend with the clean-architecture folder layout (favoring simplicity over clever abstractions per project constraints). Includes PostgreSQL connection, Docker Compose dev environment, base middleware (request logging, error handling, JSON parsing), structured logging with traceId per the Observability Standards in CLAUDE.md, and a health-check endpoint. No domain features yet — this is purely the platform.
- **Reasoning for Level 3**: Multiple components (HTTP layer, DB layer, config, logging, Docker), and the architectural decisions here (folder layout, error-handling shape, logger abstraction) cascade to every later feature. Warrants `/banyan-creative` to lock in the layout before building.
- **Linked Tasks**: TASK-001
- **Branch**: `feature/FEAT-001-express-api-typescript`
- **Created**: 2026-04-28

### FEAT-002: Authentication

- **Version**: v0.2.0
- **Status**: planned
- **Priority**: high
- **Complexity**: Level 3
- **Description**: Email + password authentication. Bcrypt password hashing, session cookies (httpOnly, SameSite=Lax), session store backed by PostgreSQL. Endpoints: signup, login, logout, "current user". Password reset flow is deferred to post-MVP unless trivial. MFA is post-MVP per productBrief.
- **Reasoning for Level 3**: Auth touches multiple layers (routes, middleware, password hashing, session store, frontend auth state) and has design decisions to lock in (session vs JWT, session store, cookie attributes). Worth a creative phase.
- **Linked Tasks**: None
- **Branch**: `feature/FEAT-002-authentication`
- **Created**: 2026-04-28

### FEAT-003: Boards & Memberships

- **Version**: v0.2.0
- **Status**: planned
- **Priority**: high
- **Complexity**: Level 3
- **Description**: Board CRUD plus membership model (member/admin roles per board, per productBrief Authorization). Invite flow — initially link-based; SMTP email invites can follow once SMTP is wired. Endpoints for listing boards visible to the current user, creating/renaming/deleting a board, and managing members.
- **Reasoning for Level 3**: Authorization model (per-board RBAC) and invite flow both need design decisions. Multi-component (data model, RBAC middleware, board UI, invite UI).
- **Linked Tasks**: None
- **Branch**: `feature/FEAT-003-boards-and-memberships`
- **Created**: 2026-04-28

### FEAT-004: Columns & Cards

- **Version**: v0.3.0
- **Status**: planned
- **Priority**: high
- **Complexity**: Level 3
- **Description**: Three default columns per board (To Do, In Progress, Done — column customization is an open question in productBrief). Card model with title, description, due date, labels (M2M to FEAT-006). Card CRUD endpoints. Ordered position within a column — needs an ordering scheme that survives concurrent moves.
- **Reasoning for Level 3**: Card-ordering scheme (fractional indexes vs gap-based integers vs linked list) is a real design decision that has long-tail consequences for FEAT-005. Worth a creative phase to settle.
- **Linked Tasks**: None
- **Branch**: `feature/FEAT-004-columns-and-cards`
- **Created**: 2026-04-28

### FEAT-005: Drag-and-Drop

- **Version**: v0.3.0
- **Status**: planned
- **Priority**: high
- **Complexity**: Level 3
- **Description**: Frontend drag-and-drop for moving cards between columns and reordering within a column. Optimistic UI with server-side confirmation (per productBrief: <100ms perceived latency). Keyboard-accessible card movement is a first-class path, not an afterthought (WCAG 2.1 AA per productBrief).
- **Reasoning for Level 3**: Library choice, optimistic-update reconciliation strategy, and keyboard a11y model are interlocking design decisions. Critical UX surface.
- **Linked Tasks**: None
- **Branch**: `feature/FEAT-005-drag-and-drop`
- **Created**: 2026-04-28

### FEAT-006: Labels

- **Version**: v0.3.0
- **Status**: planned
- **Priority**: medium
- **Complexity**: Level 2
- **Description**: Color-coded labels scoped per board. Label CRUD, many-to-many to cards, label-aware filtering on the board view. Color-blind-safe pairing of labels with text/icons (no color-alone signaling per productBrief Accessibility).
- **Reasoning for Level 2**: Standard CRUD with a join table; no significant design decisions beyond the schema.
- **Linked Tasks**: None
- **Branch**: `feature/FEAT-006-labels`
- **Created**: 2026-04-28

### FEAT-007: Due Dates

- **Version**: v0.3.0
- **Status**: planned
- **Priority**: medium
- **Complexity**: Level 2
- **Description**: Due-date field on cards (schema lives in FEAT-004; this feature adds the UX). Visual indicators for upcoming and overdue cards. Locale-aware date formatting per productBrief i18n.
- **Reasoning for Level 2**: Clear requirements, mostly UI work plus a small bit of date math.
- **Linked Tasks**: None
- **Branch**: `feature/FEAT-007-due-dates`
- **Created**: 2026-04-28
