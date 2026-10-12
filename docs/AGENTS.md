# AGENTS.md

Instructions for AI coding agents (Antigravity, Claude Code, Cursor and similar) working in this repository. Humans can read it too.

## Project in one paragraph

InvLab is a multi-warehouse inventory and sales app. Stock is kept per warehouse, every stock change writes a ledger entry, and three roles (Admin, Warehouse Manager, Staff) are enforced on the server. Backend: Django 5.2 + Django REST Framework + PostgreSQL. Frontend: React 19 + TypeScript + Vite + Tailwind.

## Read before you change anything

1. [FRD.md](FRD.md): requirements and business rules (BR-01 to BR-15)
2. [ARCHITECTURE.md](ARCHITECTURE.md): layers, flows and decisions
3. [DATABASE.md](DATABASE.md): tables, constraints and invariants
4. [API.md](API.md): endpoint and error conventions
5. [DESIGN.md](DESIGN.md): tokens, components and voice (for any UI work)

If a request conflicts with these documents, stop and ask. If you change behaviour, update the relevant document in the same change.

## Working method

1. Scan the code first and follow existing structure, naming and patterns. Do not assume a file or feature exists; check.
2. Show a short plan, then implement, then list every file changed.
3. Work in small steps on a feature branch; do not touch unrelated code.
4. Run the checks below before declaring a task finished, and report the results honestly, including anything you could not run.

## Commands

Update this list in milestone M0 if tooling changes.

```
# backend
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py test
ruff check . && ruff format --check .

# frontend (in frontend/)
npm run lint
npm run typecheck
npm run test
npm run build

# end to end
npm run e2e
```

## Hard rules

1. **Stock changes only through inventory services.** Never update `StockLevel.quantity` or create `StockMovement` rows anywhere else.
2. **Every stock-changing operation** runs in `transaction.atomic()`, locks the needed `StockLevel` rows with `select_for_update()` in a fixed order (warehouse id, then product id), checks quantities after locking, and writes exactly one movement per change in the same transaction.
3. **Never bypass warehouse scoping.** Use the scoping mixin for every warehouse-owned model. Another warehouse's record must return 404.
4. **Every endpoint has an explicit permission class** and an entry in the permission-matrix test.
5. **The server computes money and totals.** The client only displays them. Use `Decimal` for money; quantities are integers.
6. **Ledger and audit tables are append-only.** No update or delete code paths.
7. **Records with history are deactivated, not deleted.**
8. **Migrations are additive** and must run on SQLite and PostgreSQL. Never edit or delete an existing migration.
9. **No secrets** in code, tests, logs or commits. Configuration comes from environment variables.
10. **No new dependency** without a one-line justification in your summary.

## Backend conventions

- Views validate and delegate; services contain rules. Services raise domain errors that the API layer maps to the standard error body.
- Keep read queries in selectors with `select_related` and `prefetch_related`; add a query-count test for new list endpoints.
- Add type hints to service functions and docstrings to public services.
- Concurrency-sensitive code needs a concurrency test (PostgreSQL only, skipped on SQLite).

## Frontend conventions

- Use tokens and components from `components/ui/`. No hard-coded colours, sizes or durations.
- Server data through TanStack Query; forms through React Hook Form and Zod; errors from the API are mapped to fields.
- Handle loading, empty and error states on every data screen.
- Hiding a control is cosmetic. Never rely on it for security.
- Respect `prefers-reduced-motion`; keep motion short and purposeful.
- Money and dates use the `en-IN` formatters in `lib/format`.
- Interface text: sentence case, specific button labels, errors that say what to do next.

## Definition of done

- Meets the requirement IDs and acceptance criteria you were given
- Tests added or updated; all checks above pass
- Permissions and scoping covered for changed endpoints
- No unrelated changes; no leftover debug code
- Docs updated; CHANGELOG entry added
- Summary lists files changed, schema changes, new dependencies and known limitations

## Things to ask the human about

- Anything touching authentication, permissions, scoping or the stock model
- A change that needs a non-additive migration
- A requirement that seems to contradict another one
- A choice between libraries when none is named in [TRD.md](TRD.md)
- Open questions listed in [PRD.md](PRD.md#14-open-questions)
