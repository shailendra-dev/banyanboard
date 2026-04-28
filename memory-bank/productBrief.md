# Product Brief

> This document captures the business and product context for development teams.
> It ensures all agents understand the product's purpose, users, and constraints.

## Product Overview

- **Name**: BanyanBoard
- **Value Proposition**: A lightweight kanban board for small teams to track work without the complexity (or cost) of enterprise tools like Jira. Visual, fast, and self-hostable.
- **Product Type**: Self-hosted Web App (SaaS-ready)
- **Stage**: MVP

## Key Functionality

Core capabilities this product provides:

- **Boards** — create named boards, one per project or workstream
- **Columns** — fixed default set (To Do, In Progress, Done); columns hold ordered cards
- **Cards** — title, description, due date, labels; drag-and-drop between columns
- **Labels** — color-coded tags for categorizing cards (e.g., "bug", "feature", "blocked")
- **Due Dates** — visual indicators for upcoming and overdue cards
- **Multi-user collaboration** — shared boards visible to all team members

## Markets Serviced

- **Primary Market**: Small software teams, startups, and product squads (3–15 people)
- **Secondary Markets**: Non-software small teams (marketing, ops, freelance collectives) needing simple task tracking
- **Geographic Focus**: Global (English-only at MVP)
- **Market Size**: [To be determined] — segment is large but heavily contested

## Competitive Landscape

- **Direct Competitors**: Trello, GitHub Projects, Linear (low end), Notion boards
- **Indirect Competitors**: Spreadsheets, sticky notes on a wall, Jira (overkill for small teams)
- **Key Differentiators**:
  - Self-hostable via a single `docker compose up` — no SaaS lock-in
  - Opinionated simplicity: three columns, no swimlanes, no workflows-as-code
  - Open architecture, easy to fork and extend
- **Competitive Advantages**: Low operational overhead, predictable cost (you host it), no per-seat pricing

## Key Personas

### Primary Users

| Persona | Role | Goals | Pain Points | Success Metrics |
|---------|------|-------|-------------|-----------------|
| **Maya, Team Member** | IC engineer/designer/PM | See what she owns, move cards as work progresses, surface blockers | Tools are slow, cluttered, or require admin intervention to use | Updates a card in <10 seconds; opens the board daily |
| **Devon, Team Lead** | Engineering manager / squad lead | Get a quick read on team workload and what's at risk | Status meetings to extract info already in tools; reports go stale fast | Sees the team's state at a glance without asking anyone |

### Secondary Users

| Persona | Role | Goals |
|---------|------|-------|
| **Riley, Stakeholder** | PM / exec / client | Spot-check progress without nagging the team |
| **Sam, External Collaborator** | Contractor / partner | View a board they've been invited to and update assigned cards |

### Administrators/Operators

| Persona | Role | Responsibilities |
|---------|------|------------------|
| **Jordan, Team Admin** | First teammate to set up the tool, often the team lead | Provision the deployment, manage board membership, reset passwords |
| **Pat, Self-Host Operator** | DevOps-savvy engineer in the host org | Run Docker Compose, manage backups, apply updates |

## User Flows

- **Primary Flow**: User opens the board → scans columns → drags a card from "In Progress" to "Done" → adds a comment or due date if needed
- **Onboarding**: Admin runs `docker compose up` → first user signs up and becomes admin → creates first board → invites team via email/link
- **Key Workflows**:
  - **Create a board** → name it → board opens with the three default columns
  - **Add a card** → click "+" on a column → enter title → optionally add description, due date, labels
  - **Move a card** → drag and drop between columns (or via keyboard for a11y)
  - **Triage an overdue card** → due-date indicator highlights it → click to reschedule or reassign

## Success Metrics & KPIs

### Business Metrics
- Number of self-hosted instances active per month (anonymous, opt-in telemetry)
- GitHub stars / community contributions (proxy for adoption)
- Conversion rate from install to ≥1 board created with ≥3 cards within 24h

### Product Metrics
- **WAU per deployment**: % of registered team members active in a 7-day window (target: ≥70%)
- **Cards moved per active user per week** (target: ≥10)
- **Time-to-first-card** from signup (target: <60 seconds)
- **Board creation friction**: % of users who create a board within 5 minutes of signup (target: ≥80%)

### Technical Metrics
- API p95 latency: <200ms; p99: <500ms
- Drag-and-drop perceived latency: <100ms from drop to server-confirmed state
- Uptime (self-hosted): target 99% during business hours
- Error rate: <0.5% of API requests return 5xx

## Non-Functional Requirements

### Performance

- **Response Time**: API p95 < 200ms, p99 < 500ms for read endpoints; card move operations confirmed in <100ms perceived (optimistic UI + server confirmation)
- **Throughput**: Designed for ~50 req/s per instance (small-team scale)
- **Concurrent Users**: 20–50 simultaneous users per deployment (one team)
- **Page Load Time**: <2s on broadband; first board render <1s after auth

### Scalability

- **Users**: 5–50 per deployment at MVP; design should not preclude scaling to 200
- **Data Volume**: Up to ~10k cards and ~100 boards per deployment
- **Growth Rate**: Linear with team size, not viral
- **Peak Load**: ~3x average (Monday morning planning, end-of-sprint pushes)

### Security

- **Authentication**: Email + password with bcrypt hashing; session cookies (httpOnly, SameSite=Lax). MFA deferred to post-MVP.
- **Authorization**: Per-board membership (member or admin); admins can invite/remove. No public boards at MVP.
- **Compliance**: No formal certification at MVP. Self-hosted model means compliance is the operator's responsibility.
- **Data Classification**: Card content is Internal — may include project plans but should not store secrets, PII, or regulated data
- **Encryption**: TLS in transit (operator-managed reverse proxy expected); database encryption at rest is operator-configured

### Availability & Reliability

- **Uptime Target**: 99% (self-hosted; depends on operator's infra)
- **Recovery Time Objective (RTO)**: 1 hour (restore from latest DB backup)
- **Recovery Point Objective (RPO)**: 24 hours (daily backups recommended; operator-managed)
- **Disaster Recovery**: Single-region; restore from PostgreSQL backup
- **Backup Strategy**: Document recommended `pg_dump` cadence; do not implement managed backups at MVP

### Data & Privacy

- **Data Residency**: Wherever the operator hosts (no managed cloud at MVP)
- **Data Retention**: Indefinite by default; admin can delete boards/users
- **Privacy Requirements**: GDPR-friendly — support full account deletion (cascade delete user's content or anonymize)
- **PII Handling**: Only collected PII is email + display name; no behavioral tracking
- **Data Portability**: JSON export of a board (cards, columns, labels)
- **Right to Deletion**: Account deletion endpoint that purges or anonymizes user data

### Accessibility

- **Target Compliance**: WCAG 2.1 AA
- **Key Requirements**:
  - [x] Screen reader compatibility (semantic HTML, ARIA for drag-and-drop)
  - [x] Keyboard navigation (move cards via keyboard, not just drag)
  - [x] Color contrast compliance (label colors paired with text or icons, never color-alone)
  - [x] Focus indicators (visible focus rings on all interactive elements)
  - [x] Alt text for images (avatars, label icons)
  - [ ] Captions for video/audio (N/A — no media)

### Internationalization (i18n)

- **Supported Languages**: English only at MVP
- **Localization Needs**:
  - [x] Date/time formatting (locale-aware due date display)
  - [ ] Currency formatting (N/A)
  - [x] Number formatting (locale-aware)
  - [ ] RTL support (deferred)
  - [ ] Cultural considerations (deferred — minimal UI copy at MVP)

### Browser/Platform Support

- **Browsers**: Latest two versions of Chrome, Firefox, Safari, Edge
- **Mobile**: Responsive web (read + light edit); native apps are not in scope
- **Desktop**: Web only — no native desktop client

## Integration Points

### External Systems

| System | Purpose | Protocol | Direction |
|--------|---------|----------|-----------|
| SMTP server | Sending invite and notification emails | SMTP | Outbound |

### APIs Consumed

| API | Provider | Purpose |
|-----|----------|---------|
| (none at MVP) | — | — |

### APIs Provided

| API | Purpose | Consumers |
|-----|---------|-----------|
| BanyanBoard REST API | All board/card/user operations | The React frontend; future integrations (e.g., GitHub webhooks) |

### Data Sources

| Source | Type | Frequency |
|--------|------|-----------|
| PostgreSQL | Relational database | Real-time (single source of truth) |

## Constraints & Assumptions

### Business Constraints

- Solo-developer / small-team build — scope must fit a small team's nights-and-weekends pace
- No marketing budget at MVP — adoption depends on word-of-mouth and OSS visibility
- No paid SaaS hosting at MVP — distribution is the Docker Compose bundle

### Technical Constraints

- Stack is fixed: React, TypeScript/Express, PostgreSQL, Docker Compose
- Clean architecture — but the team explicitly favors simplicity over clever abstractions; do not introduce DI containers, CQRS, or event sourcing without strong justification
- Must run on a single host with `docker compose up` — no Kubernetes, no managed services

### Assumptions

- Users have basic web literacy; no training is provided
- Operators are technical enough to run Docker Compose and manage a reverse proxy
- Teams are co-located in trust (members trust each other); fine-grained per-card permissions are not required
- English-speaking users at MVP; i18n is a known future need

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Crowded market — users default to Trello/Linear | High | High | Differentiate on self-hosting and simplicity; target teams that explicitly want to own their data |
| Drag-and-drop accessibility is hard to do well | Medium | Medium | Build keyboard-first card movement from day one; treat drag as an enhancement |
| Self-hosters need backups and forget | Medium | High | Document `pg_dump` clearly; consider an in-app backup reminder post-MVP |
| Scope creep into "Trello clone with everything" | High | Medium | Hold the line on three default columns and minimal card fields; gate new features on real user demand |
| Single-host deployment limits adoption by larger teams | Medium | Low (at MVP) | Acceptable — larger teams are not the target |

## Open Questions

- [ ] Will we offer a hosted SaaS tier eventually, or remain self-host-only?
- [ ] Should columns be customizable per board, or strictly fixed at three?
- [ ] Real-time sync (WebSockets) at MVP, or polling? Trade-off: complexity vs. multi-user feel
- [ ] Card assignees: include at MVP or defer to v1.1?
- [ ] Comments on cards: MVP feature or post-MVP?
- [ ] Anonymous opt-in telemetry — yes/no, and what to collect?

## Document History

| Date | Author | Changes |
|------|--------|---------|
| 2026-04-28 | /banyan-init | Initial creation populated from project description |

## Last Refreshed

2026-04-28
