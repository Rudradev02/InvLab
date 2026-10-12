# Contributing

Thanks for helping build InvLab. This guide covers how to work in the repository. Read [README.md](README.md) for the overview and [ARCHITECTURE.md](ARCHITECTURE.md) before changing anything that touches stock, permissions or warehouse scoping.

## 1. Getting started

1. Clone the repository and copy `.env.example` to `.env`.
2. Start with Docker (`docker compose up --build`) or run Django and Vite natively (see [DEPLOYMENT.md](DEPLOYMENT.md#4-local-run)).
3. Load demo data with `python manage.py seed_data`.
4. Install the pre-commit hooks so lint and format run before each commit.

## 2. Workflow

- `main` is always deployable. Do not push to it directly.
- Create a short-lived branch: `feature/<topic>`, `fix/<topic>`, `chore/<topic>` or `docs/<topic>`.
- Keep pull requests small and focused on one change. Link the requirement IDs (for example `FR-STK-003`).
- Rebase on `main` before opening the pull request; squash on merge.

## 3. Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(stock): add adjust-stock service with ledger entry
fix(sales): reject duplicate product lines
docs(api): document transfer endpoints
test(transfers): cover opposite concurrent transfers
chore(ci): cache pip dependencies
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`, `ci`.

## 4. Code conventions

### Backend

- Views stay thin. Business rules live in `services.py` of the relevant app.
- Stock changes always go through the inventory services. Never update `StockLevel.quantity` anywhere else.
- A service that changes stock opens `transaction.atomic()`, locks rows with `select_for_update()` in the fixed order (warehouse id, then product id), checks after locking, and writes the movement and audit entry.
- Every new endpoint declares a permission class, uses the scoping mixin for warehouse-owned models, and is added to the permission-matrix test.
- Money is `Decimal`; quantities are integers.
- Migrations are additive and committed with the change that needs them.
- Format and lint with Ruff.

### Frontend

- TypeScript `strict`; avoid `any`.
- Use design tokens and components from `components/ui/`; no hard-coded colours or sizes. See [DESIGN.md](DESIGN.md).
- Server data goes through TanStack Query; forms use React Hook Form and Zod.
- Hiding a control is cosmetic; never rely on it for security.
- Every data screen handles loading, empty and error states.
- Format with Prettier and lint with ESLint.

## 5. Tests

- Add or update tests with every change. See [TESTING.md](TESTING.md).
- A bug fix starts with a failing test.
- Concurrency tests need PostgreSQL.

## 6. Pull request checklist

- [ ] Describes what and why, and links requirement IDs
- [ ] Tests added or updated; all CI checks pass
- [ ] Permissions and scoping covered for new or changed endpoints
- [ ] No secrets, real data or debugging code
- [ ] Migrations are additive and tested on PostgreSQL
- [ ] UI changes include screenshots at desktop and phone widths
- [ ] Accessibility checked (keyboard, focus, contrast)
- [ ] Docs and CHANGELOG updated

## 7. Reviewing

- Check behaviour against the requirement, not only the code style.
- Look hardest at transactions, locking, permissions and scoping.
- Ask for a test when something is hard to reason about.
- Be kind and specific; suggest, do not demand.

## 8. Reporting problems

Open an issue with steps to reproduce, what you expected and what happened, plus the role and browser. For security problems, follow [SECURITY.md](SECURITY.md#11-reporting-a-vulnerability) instead of opening a public issue.
