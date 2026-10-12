# Roadmap

| | |
| --- | --- |
| Product | InvLab |
| Version | 0.1 (draft) |
| Date | 2026-10-12 |
| Related | [PRD.md](PRD.md), [FRD.md](FRD.md) |

Size guide: **S** about 2 to 3 days, **M** about 1 week, **L** about 2 weeks, for one developer working part-time. Dates are not fixed; each milestone ends when its exit criteria are met.

## 1. Plan at a glance

| Milestone | Release | Theme | Size |
| --- | --- | --- | --- |
| M0 | pre-1.0 | Foundations: repo, tooling, CI, Docker, app shell | M |
| M1 | v1.0 | Auth, roles, warehouses, users, scoping | L |
| M2 | v1.0 | Catalogue, per-warehouse stock, ledger | L |
| M3 | v1.0 | Sales and receipts | M |
| M4 | v1.0 | Dashboards and Admin warehouse overview | M |
| M5 | v1.0 | Stock transfers | M |
| M6 | v1.0 | Hardening and launch | M |
| M7 | v1.1 | Customers, credit, discounts, payment methods, returns, reports | L |
| M8 | v1.1 | GST invoices, suppliers and purchase orders, profit | L |
| M9 | v1.2 | Barcode, notifications, images, dark mode, search, batches | L |

Build order matters: each milestone assumes the previous ones. Per-warehouse stock (M2) comes before anything that touches stock so later features are warehouse-aware from the start.

## 2. Milestones

### M0: Foundations

**Deliver**
- Repository with Django project (`config`, apps skeleton) and React + Vite + TypeScript frontend
- Ruff, ESLint, Prettier, pre-commit hooks
- GitHub Actions: backend tests (PostgreSQL service), frontend lint, type-check, build, `makemigrations --check`
- Dockerfile, `docker-compose.yml`, `.env.example`, `/healthz/`
- Design tokens, Tailwind setup, app shell (sidebar, top bar), base UI components with states
- API client (CSRF, error parsing), TanStack Query and router set up
- README quick start

**Exit criteria**
- `docker compose up` shows the empty app shell; CI is green on `main`; a sample endpoint and a sample page have tests.

### M1: Auth, roles, warehouses, users

**Deliver**
- Custom user decision, `UserProfile`, role groups, warehouse model
- Login, logout, `/auth/me/`, change password, forced change at first sign-in, throttling
- Scoping mixin, permission classes, guard test, permission-matrix test harness
- Warehouses CRUD (Admin) with manager assignment
- Users CRUD with Admin and Manager rules; deactivation ends sessions
- Audit log for role, warehouse and activation changes
- Frontend: sign-in, route guards, role-aware navigation, 403 page, Users and Warehouses (list and forms)
- Seed command with one Admin, three warehouses, managers and staff

**Exit criteria**
- FR-AUTH, FR-WH-001 to 003, FR-USR and FR-AUD pass their acceptance tests; foreign-warehouse requests return 404 in every test.

### M2: Catalogue, stock, ledger

**Deliver**
- Categories and products with validation and search
- `StockLevel`, `StockMovement`, check constraints, indexes
- Services: add to warehouse, receive, adjust, all idempotent, all writing movements and audit entries
- Ledger endpoints and pages; product detail with per-warehouse stock
- Stock indicator component; low-stock lists
- `check_stock_integrity` command and test
- Concurrency tests for receive and adjust

**Exit criteria**
- Stock never goes negative in any test; ledger reconciles after randomised operations; Staff can receive and adjust, Manager sees the ledger.

### M3: Sales and receipts

**Deliver**
- Sale and sale-line models, number sequence per warehouse and year
- `create_sale` service with locking, idempotency and clear shortage errors
- New sale screen (desktop and phone layouts), sales history, sale detail, printable receipt
- Concurrency tests for sales and numbering

**Exit criteria**
- Two simultaneous sales of the last unit result in one sale; a 3-line sale takes under 30 seconds in the scripted walkthrough; receipts print correctly.

### M4: Dashboards and Admin overview

**Deliver**
- Dashboard endpoint with role variants and warehouse filter, using aggregation only
- Admin, Manager and Staff dashboards with KPIs, trend chart, low-stock list, recent sales
- Admin Warehouses overview (manager, staff, address, stock, sales), comparison charts, warehouse detail tabs
- Query-count tests; performance check with the large seed

**Exit criteria**
- Dashboard figures equal figures computed from raw records; overview matches FR-WH-004; p95 under 300 ms on the performance seed.

### M5: Transfers

**Deliver**
- Transfer models and state machine; dispatch, receive, cancel services with fixed lock order
- Variance handling; transfer numbers
- Transfers pages (outgoing, incoming, all), timeline, receive dialog; incoming count on the Manager dashboard
- Concurrency tests including opposite transfers

**Exit criteria**
- Transfer conservation test passes; no deadlocks in the concurrent suite; the example in the FRD (10 sent, 8 received) passes end to end.

### M6: Hardening and launch (v1.0)

**Deliver**
- Full permission matrix and scoping coverage; accessibility pass with axe and keyboard review
- Rate limits, security headers, CSP; `check --deploy` clean
- Playwright flows E2E-1 to E2E-6
- Production deployment (Render + Neon), health check, backup restore rehearsal
- README with screenshots and a short walkthrough GIF; live demo link with cold-start note; CHANGELOG entry for 1.0.0

**Exit criteria**
- All quality gates in [TESTING.md](TESTING.md) pass; the security checklist in [SECURITY.md](SECURITY.md) is complete; the live site passes a smoke test.

### M7: Customers, payments, returns, reports (v1.1, part 1)

**Deliver**
- Customers with purchase history; credit balances and payments; discounts and payment methods
- Returns and refunds with ledger movements
- Report registry, sales, stock, low-stock, receivables and returns reports, with CSV, Excel and PDF export
- Role updates (Cashier-style discount limit for Staff)

**Exit criteria**
- Customer balances equal the sum of their sales' balances; exports match database totals; return tests pass including concurrent returns.

### M8: GST, purchasing, profit (v1.1, part 2)

**Deliver**
- Business settings, tax fields, GST invoices and PDF, numbering per warehouse and year
- Suppliers and purchase orders with receiving and weighted-average cost
- Cost snapshot on sales, profit and margin on dashboards and reports

**Exit criteria**
- Tax maths tests pass for inclusive and exclusive pricing and for CGST/SGST and IGST; receiving updates stock, ledger and cost atomically; profit equals line-level data and flags unknown costs.

### M9: Extras (v1.2)

**Deliver**
- Barcode and QR scanning; low-stock emails and daily summary; product images; dark theme; command palette and global search; batch and expiry tracking (last, with a safety review first)

**Exit criteria**
- Each feature meets its FRD section; no regression in the concurrency suite; contrast checks pass in both themes.

## 3. Backlog (not scheduled)

| Idea | Note |
| --- | --- |
| Fractional quantities and units of measure | Needs a quantity type change; plan a migration |
| Stock counts (cycle counting) with approval | Fits after returns |
| Multi-language interface | Strings are centralised to allow it |
| Offline-tolerant sale entry | Large; revisit after launch feedback |
| Role customisation | Only if three roles prove too few |
| Webhooks or API keys for integrations | After v1.2 |

## 4. Definition of done (every task)

- Meets its requirement IDs and acceptance criteria
- Tests added or updated and passing in CI
- No new lint, type or accessibility errors
- Permissions and scoping covered if an endpoint changed
- Docs updated (API, FRD or design notes where relevant) and CHANGELOG entry added
- Reviewed and merged through a pull request
