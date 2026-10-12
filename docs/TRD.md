# Technical Requirements Document (TRD)

| | |
| --- | --- |
| Product | InvLab |
| Version | 0.1 (draft) |
| Date | 2026-10-12 |
| Related | [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md), [SECURITY.md](SECURITY.md), [TESTING.md](TESTING.md) |

## 1. Purpose

This document states the technical requirements the implementation must meet: the stack, quality targets, standards and constraints. Functional behaviour is in [FRD.md](FRD.md); the design that satisfies these requirements is in [ARCHITECTURE.md](ARCHITECTURE.md).

## 2. Technology stack

| Layer | Choice | Version | Why |
| --- | --- | --- | --- |
| Language (backend) | Python | 3.12 | Mature, readable, strong typing support |
| Web framework | Django | 5.2 LTS | Built-in auth, ORM, migrations, admin; long-term support |
| API | Django REST Framework | Current stable | Serialisation, permissions, throttling, pagination |
| API schema | drf-spectacular | Current stable | OpenAPI 3 schema and interactive docs |
| Database | PostgreSQL | 16 | Row locking, check constraints, strong transactions |
| DB driver | psycopg (v3) | Current stable | Maintained driver with Django 5 support |
| DB config | dj-database-url | Current stable | One `DATABASE_URL` setting for all environments |
| Static files | WhiteNoise | Current stable | Serves the built SPA and static assets from Django |
| App server | gunicorn | Current stable | Standard production WSGI server |
| Language (frontend) | TypeScript | 5.x, strict mode | Type safety across the API boundary |
| UI library | React | 19 | Component model, large ecosystem |
| Build tool | Vite | Current stable | Fast development server and optimised builds |
| Styling | Tailwind CSS | 3.x or 4.x | Tokens as utilities, small output |
| Components | Radix UI primitives (shadcn/ui pattern) | Current stable | Accessible, unstyled building blocks |
| Server state | TanStack Query | 5 | Caching, retries, invalidation |
| Routing | React Router | 7 | Nested routes and guards |
| Forms | React Hook Form + Zod | Current stable | Typed forms with schema validation |
| Charts | Recharts | Current stable | React-friendly charts that read CSS variables |
| Motion | Framer Motion | Current stable | Layout and presence animation with reduced-motion support |
| Toasts | Sonner | Current stable | Accessible notifications |
| Icons | lucide-react | Current stable | One consistent icon set |
| Backend tests | Django test runner | Built in | `TransactionTestCase` is needed for concurrency tests |
| Frontend tests | Vitest + Testing Library (+ MSW) | Current stable | Fast component tests with a mocked API |
| End-to-end tests | Playwright | Current stable | Reliable cross-browser flows |
| Lint and format (backend) | Ruff | Current stable | One fast tool for lint and format |
| Lint and format (frontend) | ESLint + Prettier | Current stable | Standard toolchain |
| Containers | Docker, Docker Compose | Current stable | One-command local run |
| CI | GitHub Actions | n/a | Runs on every push and pull request |
| Hosting | Render (web service) + Neon (PostgreSQL) | n/a | Free or low-cost tiers; platform can change |

"Current stable" means the latest stable release when the dependency is first added; versions are then pinned in lock files. A dependency not listed here needs a short justification in the pull request.

## 3. Non-functional requirements

### 3.1 Performance

| ID | Requirement |
| --- | --- |
| NFR-PERF-01 | List endpoints respond with p95 under 300 ms on a database with 10,000 products and 100,000 stock movements. |
| NFR-PERF-02 | Confirming a sale of up to 20 lines completes with p95 under 500 ms. |
| NFR-PERF-03 | No list or dashboard endpoint issues a query per row (no N+1). Tests assert query counts for the main endpoints. |
| NFR-PERF-04 | The initial JavaScript bundle is under 250 KB gzipped. Charts, scanner and PDF code are loaded lazily. |
| NFR-PERF-05 | Largest Contentful Paint is under 2.5 s on a mid-range phone on a fast 4G connection, excluding a cold start of the host. |

### 3.2 Correctness and data integrity

| ID | Requirement |
| --- | --- |
| NFR-DATA-01 | Every operation that changes stock runs in one `transaction.atomic` block and locks the affected `StockLevel` rows with `select_for_update` before checking quantities. |
| NFR-DATA-02 | A database check constraint keeps `StockLevel.quantity >= 0`. |
| NFR-DATA-03 | Money uses `Decimal` with two places; quantities are integers. Floating point is never used for either. |
| NFR-DATA-04 | Stock movements and audit log entries are append-only in application code, with no update or delete endpoints. |
| NFR-DATA-05 | For every stock level, the sum of its movements equals its quantity. A test and a management command verify this. |
| NFR-DATA-06 | Sequential numbers (sales, transfers) are issued inside the creating transaction from a locked counter row. |
| NFR-DATA-07 | Migrations are additive and reversible where practical, and run on both SQLite (tests) and PostgreSQL (production). |

### 3.3 Security

Full controls are in [SECURITY.md](SECURITY.md). Requirements:

| ID | Requirement |
| --- | --- |
| NFR-SEC-01 | Session authentication with CSRF protection. No tokens in `localStorage`. |
| NFR-SEC-02 | Every endpoint has an explicit permission class. A test fails if one does not. |
| NFR-SEC-03 | Warehouse scoping is applied by one shared mechanism. Foreign records return 404. |
| NFR-SEC-04 | Sign-in and write endpoints are rate-limited. |
| NFR-SEC-05 | Production runs with HTTPS only, secure cookies, HSTS and a Content-Security-Policy. `check --deploy` passes. |
| NFR-SEC-06 | Secrets come from environment variables. None are committed. |
| NFR-SEC-07 | Passwords use Django's default hashing and the password policy in the FRD. |
| NFR-SEC-08 | Dependencies are scanned for known vulnerabilities in CI. |

### 3.4 Reliability and operations

| ID | Requirement |
| --- | --- |
| NFR-OPS-01 | A `/healthz/` endpoint returns 200 without authentication and without touching sensitive data. |
| NFR-OPS-02 | Application logs are structured (JSON) and never contain passwords, session ids or full request bodies. |
| NFR-OPS-03 | Errors are captured with a stack trace and a request id. An error tracker (for example Sentry) is optional. |
| NFR-OPS-04 | Database backups use the provider's point-in-time recovery. A restore is rehearsed once before launch. |
| NFR-OPS-05 | Deployments run migrations before traffic switches and can be rolled back to the previous release. |
| NFR-OPS-06 | Target availability is best effort on free tiers; a cold start of up to 60 seconds is acceptable and documented. |

### 3.5 Usability and accessibility

| ID | Requirement |
| --- | --- |
| NFR-UX-01 | Meets WCAG 2.2 AA for colour contrast, focus visibility, keyboard use and labels. |
| NFR-UX-02 | Supports the last two versions of Chrome, Edge, Firefox and Safari, and Chrome on Android. |
| NFR-UX-03 | Works from 360 px wide screens upwards. |
| NFR-UX-04 | Respects `prefers-reduced-motion` in one central place. |
| NFR-UX-05 | All dates, numbers and currency are formatted for the `en-IN` locale. The interface text is English; strings are kept in one place so another language can be added later. |

### 3.6 Scalability

The design targets one business with up to 20 warehouses, 50,000 products, 100 concurrent users and 1 million stock movements per year. Rows are indexed for these volumes ([DATABASE.md](DATABASE.md)). Horizontal scaling is possible because the app server is stateless apart from the database; sessions are stored in the database or a shared cache.

## 4. API standards

- Base path `/api/v1/`; breaking changes need a new version.
- JSON only. Field names in `snake_case`.
- Standard error body, pagination and filtering conventions are in [API.md](API.md).
- Every endpoint is documented in the generated OpenAPI schema, including the roles that may call it.
- The frontend uses types generated from, or checked against, the OpenAPI schema.

## 5. Code standards

| Area | Standard |
| --- | --- |
| Architecture | Views stay thin. Business logic lives in service functions. Services own transactions and locking. |
| Python | Ruff (lint and format); type hints on service functions; docstrings on public services |
| TypeScript | `strict` on; no `any` without a comment; ESLint and Prettier |
| Naming | Python `snake_case`; React components `PascalCase`; files `kebab-case` except components |
| Commits | Conventional Commits (see [CONTRIBUTING.md](CONTRIBUTING.md)) |
| Branches | Short-lived feature branches merged to `main` through pull requests |
| Dependencies | Locked (`requirements.txt` with hashes or a lock tool; `package-lock.json`); updated through reviewed pull requests |

## 6. Testing requirements

Detail is in [TESTING.md](TESTING.md). Gates for every pull request:

- Backend tests pass; service-layer coverage 85% or higher
- Permission-matrix test covers every endpoint, every role and every method
- Concurrency tests pass on PostgreSQL
- Frontend type-check, lint, unit tests and production build pass
- Playwright smoke flows pass
- `makemigrations --check` reports no missing migrations

## 7. Environments

| Environment | Database | Purpose |
| --- | --- | --- |
| Local (venv) | SQLite or local PostgreSQL | Day-to-day development |
| Docker Compose | PostgreSQL container | One-command run and parity with production |
| CI | PostgreSQL service container | Automated tests |
| Production | Managed PostgreSQL (Neon) | Live use |

Configuration differs only through environment variables ([.env.example](.env.example)). Debug mode is off everywhere except local development.

## 8. Constraints and assumptions

- The first release serves one organisation per installation.
- Hosting is on free or low-cost tiers with cold starts.
- Camera features (v1.2) need HTTPS outside localhost.
- File storage for images (v1.2) must not rely on the app server's disk in production.
- Whole-number quantities only.

## 9. Technical risks

| Risk | Mitigation |
| --- | --- |
| Deadlocks when several rows are locked | Fixed lock order (BR-11); tests with concurrent transfers |
| SQLite hides concurrency bugs | Concurrency tests run on PostgreSQL only; CI uses a PostgreSQL service |
| Session cookies and CSRF break in cross-origin setups | Same-origin deployment; Vite proxy in development |
| Query count grows with warehouses | Aggregation and prefetching; query-count assertions |
| Bundle growth | Route-level code splitting; bundle-size check in CI |

## 10. Key decisions

Short records of the main decisions are in [ARCHITECTURE.md](ARCHITECTURE.md#10-architecture-decisions).
