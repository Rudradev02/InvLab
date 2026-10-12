# Testing Strategy

| | |
| --- | --- |
| Product | InvLab |
| Version | 0.1 (draft) |
| Date | 2026-10-12 |
| Related | [TRD.md](TRD.md), [FRD.md](FRD.md) |

## 1. Goals

1. Prove that stock is never wrong: no overselling, no negative stock, ledger always reconciles.
2. Prove that nobody can see or change what their role and warehouse do not allow.
3. Catch regressions quickly with a fast suite, and give confidence with a few end-to-end flows.

## 2. Test pyramid

| Level | Tooling | Share | What it covers |
| --- | --- | --- | --- |
| Backend unit and service | Django test runner | Largest | Services, validation, calculations, invariants |
| Backend API | Django REST test client | Large | Endpoints, permissions, scoping, error format |
| Backend concurrency | `TransactionTestCase`, threads, PostgreSQL | Small, critical | Locking, numbering, deadlock safety |
| Frontend unit and component | Vitest, Testing Library, MSW | Medium | Forms, guards, tables, formatting, states |
| End-to-end | Playwright | Few | Core journeys through the real stack |
| Accessibility | axe (in component and e2e tests) | Per page | Serious violations fail the build |

## 3. Backend

### 3.1 Service tests

- Receive, adjust, sale, dispatch, receive-transfer and cancel-transfer: success paths, every rejection, and the exact movements written.
- Rounding and totals: sale total equals the sum of line totals.
- Number issuing: sequential, unique, resets per financial year.
- Idempotency: the same key applied twice produces one result.

### 3.2 Permission matrix

One parametrised test runs every combination of **role** (Admin, Manager, Staff, anonymous) × **endpoint** × **method** and asserts the expected status from [API.md](API.md): 200, 201, 204, 401, 403 or 404.

A second **guard test** walks all URL patterns and fails if:

- a view has no explicit permission class, or
- a view for a warehouse-owned model does not use the scoping mixin.

### 3.3 Scoping tests

For each warehouse-owned resource, create data in two warehouses and assert that a Manager and a Staff user of warehouse A:

- never see warehouse B rows in lists, search, dashboards or counts;
- receive 404 for B's records by id, for reads and writes;
- cannot create records for B by passing B's id.

### 3.4 Invariant tests

| Invariant | Test |
| --- | --- |
| Stock never negative | Attempt to over-sell, over-adjust and over-transfer; assert rejection and unchanged stock |
| Ledger reconciles | After a randomised series of operations, every stock level equals the sum of its movements |
| Transfer conservation | Units out of source equal units received plus variance; total stock changes only by recorded variance |
| Sale totals | `sale.total` equals the sum of its lines |
| One manager per warehouse | Second assignment rejected |
| Last Admin | Cannot be demoted or deactivated |

### 3.5 Concurrency tests (PostgreSQL only)

Use threads started together with a barrier, each with its own database connection, and repeat each scenario several times:

| Scenario | Expected result |
| --- | --- |
| 2 sales of the last unit | One succeeds, one is rejected; stock 0; one sale and one movement |
| 10 sales of 1 unit with stock 5 | Exactly 5 succeed; stock 0 |
| Sale and adjustment on the same row | Final quantity equals the sum of movements |
| 2 transfers dispatching the same stock | Total dispatched never exceeds stock |
| Two opposite transfers between the same warehouses | No deadlock |
| 20 simultaneous sales in one warehouse | Numbers are unique and gap-free |

These tests are skipped on SQLite with a clear message. CI runs them against a PostgreSQL service container.

### 3.6 Query-count tests

Assert the number of queries for the main list and dashboard endpoints with realistic seeded data so N+1 queries are caught.

### 3.7 Data tests

- Migrations apply on an empty database and on seeded data.
- `makemigrations --check` shows no pending changes.
- `check_stock_integrity` reports no differences after the seed command.

## 4. Frontend

| Area | Tests |
| --- | --- |
| Auth and guards | Redirect when signed out; role-based navigation; forbidden page; session expiry |
| Forms | Validation messages match the FRD rules; server field errors map to fields; submit disabled while saving |
| Sale screen | Adding the same product merges quantity; totals display; shortage message from the server is shown and lines are kept |
| Tables | Loading, empty, error and populated states; sorting and pagination calls |
| Stock indicator | Correct label and colour for in stock, low and out of stock |
| Formatting | ₹ with Indian grouping, dates in Asia/Kolkata |
| Accessibility | axe passes on each page in the component test; focus returns after dialogs close |

The API layer is mocked with MSW using handlers that mirror the documented responses, including error shapes.

## 5. End-to-end flows (Playwright)

Run against a freshly seeded database. Unique names per run, no fixed sleeps, traces and screenshots kept on failure.

| Flow | Steps |
| --- | --- |
| E2E-1 Staff sale | Sign in as Staff; create a sale of two products; confirm; stock decreases; sale appears in My sales |
| E2E-2 Stock receive and adjust | Receive 10 units; adjust down by 2 with a reason; ledger shows both (as Manager) |
| E2E-3 Access control | Staff cannot open Users or Ledger; Manager cannot open another warehouse's URL |
| E2E-4 Admin overview | Admin opens Warehouses; each card shows manager, staff, address and stock; opens a detail tab |
| E2E-5 Transfer | Manager A creates and dispatches; Manager B receives fewer units; variance shown to Admin |
| E2E-6 Onboarding | Manager creates a Staff user; the user signs in and is forced to change the password |

## 6. Quality gates

A pull request cannot merge unless all of these pass in CI:

- Backend tests, including the permission matrix and guard test
- Concurrency tests on PostgreSQL
- Service-layer coverage of 85% or more
- `manage.py check` and `makemigrations --check`
- Frontend lint, type-check, unit tests and build
- Bundle-size check (initial JavaScript under 250 KB gzipped)
- Playwright smoke flows (E2E-1 and E2E-3 on every pull request; all flows on `main`)
- Dependency vulnerability scan with no high-severity findings

## 7. Test data

- Factories build users, warehouses, products and stock for each test; tests do not depend on each other.
- The `seed_data` command provides realistic data for e2e, load and manual testing.
- A `perf_seed` option creates 10,000 products and 100,000 movements for the performance check.

## 8. Manual checks before each release

- Walk through all six journeys in the PRD on a phone-sized screen and a desktop.
- Keyboard-only pass over sign-in, new sale and adjust stock.
- Print a receipt.
- Review the audit log after a day of seeded activity.
- Restore a database backup into a scratch environment (before the first launch).

## 9. Running tests

Commands live in the README once the scaffold exists. Expected shape:

```
# backend
python manage.py test
python manage.py test --tag=concurrency      # needs PostgreSQL

# frontend
npm run lint && npm run typecheck && npm run test
npm run e2e
```
