# InvLab: Repo Review and Feature Prompts

Oct 14, 2026 · @Assassin012

## Repo review

InvLab is a working single-location inventory and sales app: a Django 5.2 REST API plus a React 19 SPA, 14 commits on `main`, with demo seed data. I read the README and the root file list, not the source files, so everything below comes from those two.

| Area | What the README and file list show |
| --- | --- |
| Backend | Django 5.2 + DRF; apps `accounts`, `api`, `inventory`, `sales`, `config`; session auth with CSRF; OpenAPI docs at `/api/docs/`; stock changes in atomic transactions with `select_for_update()` |
| Frontend | React 19, TypeScript, Vite, Tailwind, TanStack Query, React Router 7, Framer Motion, Recharts, Radix, Sonner; ivory, forest green, sage and terracotta palette |
| Features | Dashboard KPIs and revenue chart (7, 30, 90 days); category stock breakdown; low-stock watchlist; product CRUD with search, filters and sorting; stock adjustment with a reason; categories with deletion protection; sales with live invoice preview, stock guard and printable receipts |
| Data | PostgreSQL on Neon with SQLite fallback; `seed_data` creates demo records and the user `demo` |
| Docs | README, `DESIGN.md`, `.env.example`, MIT licence |
| Leftovers | `templates/` and `static/` (legacy server-rendered views) still sit beside the SPA |

Not found in the root listing: roles or warehouses, a stock ledger page, a `.github` folder (no CI), a Dockerfile, frontend tests, screenshots or a live demo link. The About link still points to the old Replit project.

## What to add, in priority order

Build warehouses and roles first, because every stock feature depends on them, then the business features, the extras and the engineering work. The prompts below use these numbers.

| Group | Prompts | Why now |
| --- | --- | --- |
| Warehouses and roles | 1 to 7 | Your planned Admin, Warehouse Manager and Staff system; per-warehouse stock and the ledger must exist before anything else touches stock |
| Business features | 8 to 15 | Returns, customers and credit, discounts, reports, purchasing, profit, GST invoices and barcode scanning make it a real shop tool |
| Extras | 16 to 20 | Email alerts, images, batch and expiry, dark mode and Ctrl+K search improve daily use |
| Engineering | 21 to 28 | Concurrency test, CI, tests, Docker, security, deployment, README and retiring the legacy templates make it hireable |

## Shared context (paste first, every time)

Paste this block first in a new Antigravity chat, then one feature prompt. Do one feature at a time and merge before the next.

```text
Project: InvLab, an inventory and sales management web app (github.com/Rudradev02/InvLab). Stack: Django 5.2 + Django REST Framework backend (apps: accounts, api, inventory, sales, config), React 19 + TypeScript + Vite + Tailwind frontend in frontend/, PostgreSQL (Neon) with SQLite fallback. API under /api/v1/ with session auth and CSRF. Stock changes already run in atomic transactions with select_for_update() in sales/services.py and inventory/services.py. Legacy server-rendered templates (templates/, static/) still exist beside the SPA; do not touch them unless the prompt says so. Demo data: python manage.py seed_data (user demo / demo12345). Backend tests: python manage.py test api.
Planned roles: Admin, Warehouse Manager, Staff, with separate stock per warehouse. Decisions already made: Staff can record sales and receive or adjust stock in their own warehouse; stock transfers between warehouses are included; products and prices are a shared catalogue.
Rules:
- First scan the codebase and follow its existing structure, naming, and patterns. Read DESIGN.md. Do not assume a file or feature exists; check.
- Use the existing design tokens from DESIGN.md (ivory background, forest green primary, sage, terracotta). No hardcoded colors.
- Do not break existing features or change unrelated code.
- Show a short plan first, then implement, then list every file changed.
- Keep all stock, money and total calculations on the server inside atomic transactions with row locking. Use Decimal for money. Show currency as ₹ with Indian number grouping.
- Access control is enforced on the server. Non-Admin users only see their own warehouse; another warehouse's record returns 404.
- Database changes must be additive migrations that work on SQLite and PostgreSQL and keep existing data.
- Handle loading, empty, and error states. Validate inputs on both frontend and backend. Respect prefers-reduced-motion.
- Add tests for the new backend logic and for any key frontend component.
- Keep the UI quiet and premium: flat cards, 1px borders, no glows.
- If a prompt depends on an earlier feature that does not exist yet, stop and tell me.
```

## Warehouses and roles (prompts 1 to 7)

These turn the single-location app into a multi-warehouse system with Admin, Warehouse Manager and Staff. Run them in order.

### 1. Warehouses, roles and scoping

```text
Feature: Warehouse model, Admin / Warehouse Manager / Staff roles, and server-side scoping.

Backend:
- Warehouse model: name, unique code, address (two lines, city, state, pincode), phone, email, is_active, nullable manager (unique, one manager per warehouse). Link each non-Admin user to exactly one warehouse through a profile; Admin has none.
- Roles as Django Groups through an idempotent data migration. Create a default 'Main Warehouse'. Existing superusers become Admin; every other existing user (including demo) becomes Staff in Main Warehouse. List them in your summary so I can promote managers.
- One scoping mixin plus permission classes: non-Admin users only see their own warehouse's records and other warehouses return 404; Admin can narrow with ?warehouse=<id>. Every endpoint gets an explicit permission class.
- /auth/me/ returns role, permissions and warehouse. seed_data creates one user per role and a second warehouse.

Frontend:
- useAuth with role and warehouse, a Can component, a role badge and warehouse name in the account menu, and a 403 page.

Edge cases: a non-Admin without a warehouse is blocked with a clear message, last Admin cannot be demoted or deactivated, nobody changes their own role, role and warehouse changes are audit-logged. Add a test that fails if any endpoint has no explicit permission.
```

### 2. Stock movement ledger

```text
Feature: Immutable ledger of every stock change.

Backend:
- StockMovement model: product, signed quantity change, type (initial, sale, adjustment, return, purchase, transfer_out, transfer_in), reason, reference, user, balance_after, created_at.
- Write a movement inside the same atomic transaction as every stock change in sales/services.py and inventory/services.py (sales and adjust-stock). The migration adds one 'initial' movement per existing product.
- Endpoints: filterable, paginated list (product, type, user, date range) and a per-product history. Manager and Admin only once roles exist.

Frontend:
- Stock Ledger page with a filter bar and a table showing signed change (green for in, terracotta for out), balance after, reason and user. Add a Ledger tab on the product detail page.

Edge cases: a rejected sale writes nothing, rows are never edited or deleted, and the sum of movements must equal current stock (add a test).
```

### 3. Separate stock per warehouse (riskiest, use its own branch)

```text
Feature: Stock kept separately for each warehouse.

Needs: prompts 1 and 2.

Backend:
- StockLevel model: product, warehouse, quantity, reorder_level; unique on product + warehouse; check quantity >= 0. Products stay a shared catalogue.
- Add warehouse to Sale and StockMovement. The migration creates a StockLevel in Main Warehouse from each product's current stock and assigns existing sales and movements to it.
- Make sales, adjustments and receiving warehouse-aware: lock the StockLevel row with select_for_update, check after the lock, write the movement. Keep Product.stock only as a cached total, updated in the same transaction, and mark it deprecated.
- Low stock uses each StockLevel's reorder level.

Frontend:
- Product table and sale screen show the current warehouse's quantity. Admin gets a warehouse selector (All or one). Product detail shows stock by warehouse.

Edge cases: a product with no StockLevel counts as 0 and can be added, the migration is safe on existing data, sales in two warehouses never block each other. Add a test that the sum of StockLevels equals the cached total.
```

### 4. Admin panel with a Warehouses overview

```text
Feature: Admin panel with full management and an all-warehouses overview.

Needs: prompts 1 to 3.

Backend:
- Warehouses CRUD and Users CRUD (Admin only): create, edit, change role, assign warehouse, activate or deactivate, reset password. Deactivate instead of delete when a warehouse has stock, sales or staff.
- Overview endpoint for all warehouses: name, code, address, phone, manager (name, phone, email), staff count and list, products stocked, total units, low-stock count, today's and 30-day sales and revenue, last activity. Add a detail endpoint with staff, stock, sales and ledger data. Use aggregation and prefetching to avoid N+1 queries.

Frontend:
- A 'Warehouses' section: cards or a table with search, status filter and sorting, plus a stock-by-warehouse chart. Detail page with tabs Overview, Staff, Stock, Sales, Ledger. Create and edit dialogs, manager dropdown, deactivate confirmation.
- Users page with role and warehouse columns and a create and edit dialog.

Edge cases: a warehouse without a manager, a user moved between warehouses keeps old records attached to the old warehouse, every endpoint is Admin-only on the server, empty states.
```

### 5. Warehouse Manager workspace

```text
Feature: Warehouse Manager runs their own warehouse.

Needs: prompts 1 to 3.

Backend:
- Scoped to their own warehouse only: stock CRUD (add a product to the warehouse, set reorder level, receive, adjust), sales view, ledger, and Staff accounts (create, edit, deactivate Staff of this warehouse; cannot create Managers or Admins).
- Can create and edit products in the shared catalogue but not delete them (Admin only).

Frontend:
- Manager dashboard for their warehouse: units, low stock, today's sales, recent sales. 'My Staff' and 'Stock' pages with CRUD dialogs. A read-only card with the warehouse address and contact.

Edge cases: another warehouse's id returns 404, managers cannot deactivate themselves, staff with sales are deactivated rather than deleted.
```

### 6. Staff workspace

```text
Feature: Staff work inside their own warehouse.

Needs: prompts 1 to 3.

Backend:
- Staff can view products and stock, record sales, view their own sales and receipts, receive stock and adjust stock with a required reason. Receiving and adjusting both write ledger movements.
- Staff cannot edit prices or products, delete anything, see other users' sales, view reports or manage users. Enforce with server permissions and queryset scoping.

Frontend:
- Minimal navigation: Sales, Stock (view, Receive, Adjust), My Sales. Receive and Adjust dialogs with quantity, reason, optional note and toasts.

Edge cases: stock never goes below zero, adjustment reason is required, double-submit protection with an idempotency key, staff of a deactivated warehouse are blocked.
```

### 7. Stock transfers between warehouses

```text
Feature: Transfer stock from one warehouse to another.

Needs: prompt 3.

Backend:
- StockTransfer (number, from and to warehouse, status draft, in_transit, received or cancelled, users, timestamps, note) and lines (quantity sent, quantity received).
- Dispatch deducts stock from the source and writes transfer_out movements. Receive adds the received quantity to the destination with transfer_in movements; a shortfall is stored as variance and not added anywhere. Cancelling while in transit returns stock to the source.
- Lock stock rows in a fixed order (warehouse id, then product id) to avoid deadlocks. Admin can act on any transfer.

Frontend:
- Transfers page with tabs Outgoing, Incoming and (Admin) All. Create dialog showing available quantities. Detail page with a status timeline and a Receive dialog. Incoming count on the Manager dashboard.

Edge cases: same source and destination, quantity above available, inactive destination, receiving twice, receiving more than sent, two opposite transfers at the same time (no deadlock).
```

## Business features (prompts 8 to 15)

These make InvLab a real shop tool. Each one is warehouse-aware, so build them after prompt 3.

### 8. Returns and refunds

```text
Feature: Full and partial sale returns.

Needs: prompt 2 (ledger). If it does not exist, stop and tell me.

Backend:
- SaleReturn and SaleReturnLine models. Never edit the original sale.
- In one atomic transaction: lock the sale lines, returnable = sold minus already returned, restore stock to the sale's warehouse, write 'return' ledger movements, and calculate the refund from the price actually paid.
- Endpoints: create a return on a sale, list returns, return detail. Sale detail shows returnable quantity per line. Manager and Admin only.

Frontend:
- 'Return items' button on the sale detail opens a dialog with quantity steppers, reason and refund method. Printable return receipt. Sales history shows a Returned badge and net total; dashboard revenue is net of refunds.

Edge cases: over-returning, two simultaneous returns, discounted sales, credit sales (the refund reduces the balance first).
```

### 9. Customers and credit balance

```text
Feature: Customers with purchase history and optional credit (udhaar).

Backend:
- Customer model: name, phone (unique), optional email, GSTIN and address. Sale gets a nullable customer, amount_paid and balance_due (existing sales backfilled as fully paid).
- Payment model. Payments apply to the oldest unpaid credit sale first. A customer with sales cannot be deleted, only deactivated.
- Endpoints: customers CRUD with search, customer sales, summary (lifetime value, balance), record payment, receivables total. Customers are shared across warehouses; each sale keeps its warehouse.

Frontend:
- Customers list and detail page. Customer picker with quick-add on the sale screen (walk-in is the default). Amount paid field with a live balance preview. Receivables card on the dashboard.

Edge cases: a credit sale needs a customer, overpayment, duplicate phone, and customer balance must equal the sum of their sale balances.
```

### 10. Discounts and payment methods

```text
Feature: Discount and payment method on every sale.

Backend:
- Sale gets discount_type (amount or percent), discount_value, discount_amount and payment_method (cash, upi, card, credit; 'unknown' for old sales). Reuse amount_paid and balance_due if they exist.
- The server validates and computes all totals. Apply the discount before tax if GST exists. Credit requires a customer. Staff can discount only up to a configurable percent (default 10); higher needs a Manager.

Frontend:
- Discount input with a ₹/% toggle and a payment method selector on the sale screen. Live total preview (display only). Show both on the receipt and add them to the sales history filters.

Edge cases: discount above subtotal, percent over 100, round half-up once per sale, legacy sales still display.
```

### 11. Reports with exports

```text
Feature: Reports page with CSV, Excel and PDF export.

Backend:
- Reports: sales summary, sales by product and category, stock list, low-stock list. Exports use the same query logic as the on-screen report. Endpoint takes date_from, date_to, category, warehouse and format (json, csv, xlsx, pdf).
- Stream CSV, use openpyxl for Excel, and pick one PDF library for the sales summary (explain the choice). Build a small report registry so later reports (profit, receivables, returns) can plug in.
- Managers get their own warehouse; Admin can choose one or all.

Frontend:
- Reports page with a tab per report, date presets (today, 7, 30, 90 days, custom), summary cards, a results table and an Export menu.

Edge cases: Asia/Kolkata date boundaries, empty ranges, escape cells starting with = + - @, totals must match the database (add tests that compare them), include returns in net figures if they exist.
```

### 12. Suppliers and purchase orders

```text
Feature: Suppliers and purchase orders that add stock when received.

Needs: prompts 2 and 3.

Backend:
- Supplier, PurchaseOrder (draft, ordered, partially received, received, cancelled) and PurchaseOrderLine models. A purchase order targets one warehouse. Add Product.cost_price if it does not exist yet.
- Receive endpoint: atomic, increases that warehouse's stock, writes 'purchase' ledger movements, and updates cost price using weighted average. Allow partial receiving.

Frontend:
- Suppliers list and detail. Purchase Orders list with status chips. Order editor with product picker, quantity and unit cost. Receive dialog with quantities prefilled.

Edge cases: over-receiving, editing after ordered, cancelling after a receipt, a supplier with orders cannot be deleted, status only moves forward.
```

### 13. Profit tracking

```text
Feature: Cost, margin and profit.

Backend:
- Product.cost_price (if missing) and a SaleLine.unit_cost snapshot copied when a sale is saved. Do not backfill old lines.
- Dashboard endpoint adds profit, margin %, profit by day and a count of lines with unknown cost, respecting the warehouse filter.

Frontend:
- Cost field with a margin preview in the product form, margin badge in the table, a Profit KPI card and a chart toggle, and a note such as 'N sales excluded: cost unknown'.

Edge cases: a missing cost is never treated as zero, discounts, returns reduce profit, later cost changes must not alter past sales. Register a Profit report if the report registry exists.
```

### 14. GST-ready invoices

```text
Feature: GST invoice with tax breakup and sequential numbering.

Backend:
- BusinessSettings (name, address, state, GSTIN, invoice prefix, prices include tax or not), Product.gst_rate and hsn_code, a tax snapshot on sale lines, Sale.invoice_number, and an InvoiceSequence per warehouse and financial year.
- Same state as the seller: CGST + SGST. Different state: IGST. Number format WHCODE/2026-27/000123, issued inside the sale transaction with the sequence row locked.
- Endpoints: business settings (Admin only), invoice JSON, invoice PDF.

Frontend:
- Settings page, GST fields in the product form, place-of-supply on the sale screen, an invoice view with tax table and amount in words (lakh and crore), Print and Download PDF.

Edge cases: inclusive vs exclusive tax, round-off line, April to March financial year, old sales without tax data, concurrent numbering. Add a README note that this is invoice formatting, not a certified filing tool.
```

### 15. Barcode and QR scanning

```text
Feature: Add items to a sale by scanning.

Backend:
- Product.barcode: optional, trimmed, unique when present, blank stored as null. Lookup endpoint by barcode, a barcode filter on the product list, and a clear duplicate error.

Frontend:
- Scanner dialog on the sale screen, lazy-loaded. Camera scanning with BarcodeDetector plus a fallback library, USB scanners as fast keyboard input, and a manual entry box. A scan adds the item or increments its quantity. An unknown barcode shows a toast with an 'Add product' shortcut for roles that can create products.

Edge cases: camera permission denied, HTTPS requirement outside localhost, out-of-stock item in the current warehouse, the main bundle must not grow noticeably.
```

## Extras (prompts 16 to 20)

These are independent of each other, so run them in any order. Batch and expiry tracking is the riskiest because it changes how stock is deducted; read its safety line first.

### 16. Low-stock emails and daily summary

```text
Feature: Email alerts and a daily summary.

Backend:
- NotificationSettings (recipients, toggles) and LowStockAlertState so an alert fires once when a stock level crosses its reorder level, per warehouse.
- Send after commit (transaction.on_commit) so a mail failure never blocks a sale. Add a management command send_daily_summary (low stock, today's sales per warehouse, receivables if credit exists). Console email in development, SMTP from env in production.
- Each Manager gets their own warehouse; Admin gets all warehouses.

Frontend:
- Bell in the top bar with a live count and popover. Settings page with toggles and a recipient list.

Edge cases: repeat alerts, reset after restock, scheduler setup documented in the README, no secrets in the repo. No Celery.
```

### 17. Product images

```text
Feature: Product images with thumbnails.

Backend:
- Optional image on Product. Validate type (JPEG, PNG, WebP), max 2 MB and a real image check. Generate a thumbnail and delete the old file on replace or delete. Ask me first which storage to use: local for development, Cloudinary or S3 for production.

Frontend:
- Upload control with drag and drop, preview and error messages. Thumbnails in the product table and the sale product picker, a placeholder when empty, lazy loading.

Edge cases: fake image files, large files, products without images, ephemeral disks on hosting platforms. Only roles that can edit products can upload.
```

### 18. Batch and expiry tracking

```text
Feature: Optional batches and expiry dates per product.

Safety line: this changes how stock is deducted. If it needs risky changes to the stock model, stop and propose a smaller design.

Needs: prompts 2 and 3.

Backend:
- Product.tracks_batches (default off) and ProductBatch (warehouse, batch number, quantity, expiry date). For tracked products keep each StockLevel equal to the sum of its batches.
- Sales consume the earliest-expiry batches first and skip expired ones, inside the locked transaction. Add an expiring-soon endpoint (default 30 days).

Frontend:
- Toggle on the product form, Batches tab on product detail, batch and expiry fields on stock receiving and adjustment, and an 'Expiring soon' dashboard panel.

Edge cases: untracked products behave exactly as before, insufficient usable stock, returns restoring to the original batch, transfers moving batches.
```

### 19. Dark mode

```text
Feature: Dark theme.

Frontend:
- Find every hard-coded color and replace it with a token. Define dark values for every token, including semantic and chart colors.
- Theme toggle (Light, Dark, System) in the account menu, saved in localStorage, plus an inline script so there is no flash on load.
- Recharts colors read CSS variables. Receipts and invoices print in light colors.
- Update DESIGN.md with the dark tokens.

Edge cases: contrast of at least 4.5:1 in both themes, follow the system setting until the user chooses, add an axe check on the main pages.
```

### 20. Global search (Ctrl+K)

```text
Feature: Command palette with global search.

Backend:
- One search endpoint returning up to 5 results each for products, sales and (if they exist) customers and warehouses, filtered by the user's role and warehouse, with a minimum query length.

Frontend:
- cmdk palette opened with Ctrl/Cmd+K and a top bar button, lazy-loaded. Groups: Navigate, Results, Quick actions (new sale, add product). Debounced search, arrow, Enter and Esc keys, focus trap, loading and no-results states. Hide actions the current role cannot use.
```

## Engineering (prompts 21 to 28)

The repo has no CI, Docker setup, frontend tests or screenshots yet. Prompts 21 and 22 are worth running first, on the code as it is today.

### 21. Concurrency test for overselling

```text
Feature: Prove two simultaneous sales cannot oversell the same stock.

- Read sales/services.py and inventory/services.py. Confirm select_for_update runs inside transaction.atomic and that the stock check happens after the lock. Report what you find.
- Add TransactionTestCase tests using threads and a barrier: stock 1 with two sales gives exactly one success; stock 5 with ten sales gives exactly five; a sale and a stock adjustment together keep stock consistent (and the ledger, if it exists).
- Run these only on PostgreSQL (skip on SQLite with a clear message) and document how to run them. If you find a real race, fix it in the service layer and keep the test.
```

### 22. GitHub Actions CI

```text
Feature: CI on every push and pull request.

- Create .github/workflows/ci.yml with two jobs.
- Backend: Python 3.12, PostgreSQL service container, pip cache, manage.py check, makemigrations --check, migrate, test.
- Frontend: Node 20, npm ci, lint, type-check, unit tests if they exist, production build. Add any missing npm scripts instead of inventing commands.
- Cancel superseded runs, use least-privilege permissions, no real secrets. Add a status badge to the README. Run the same commands locally first.
```

### 23. Frontend tests and a Playwright flow

```text
Feature: Frontend test suite and one end-to-end flow.

- Vitest + Testing Library: form validation, stock and low-stock badges, invoice preview maths, protected routes, error and empty states. Mock the API layer.
- One Playwright spec: log in with the demo user, create a product, record a sale, check stock dropped and the sale appears in history. Use unique product names, no fixed sleeps, and save traces on failure. Once roles exist, add a spec showing Staff cannot open the Users page.
- Add npm scripts (test, test:coverage, e2e) and README instructions.
```

### 24. Docker and docker-compose

```text
Feature: One-command local run.

- Multi-stage Dockerfile (Node build stage, Python slim runtime, non-root user, gunicorn, collectstatic) and a .dockerignore.
- docker-compose.yml with web and PostgreSQL (named volume, healthcheck), migrations on start, and an optional seed command.
- Add a /healthz/ endpoint. Update .env.example. README: docker compose up --build, seeding, and resetting the database volume.
```

### 25. Rate limiting and security headers

```text
Feature: Production hardening.

- Run manage.py check --deploy and list every warning first.
- DRF throttling: login 5 per minute per IP, moderate limits on write endpoints, 429 with Retry-After and a friendly message in the frontend. Note that production needs a shared cache.
- Environment-controlled production settings: SSL redirect, HSTS, secure cookies, nosniff, referrer policy, frame protection.
- Content-Security-Policy and Permissions-Policy: report-only first, enforce after testing the SPA and charts.
- Tests for the throttle and the headers.
```

### 26. Live deployment

```text
Feature: Public live URL.

- Ask me first: Render or Railway (default Render + the existing Neon database).
- Create the platform config (render.yaml or Railway equivalent): build (frontend + collectstatic), pre-deploy migrate, health check, and an environment variable list with placeholders only.
- Pin Python and Node versions, make sure deep links work with the SPA fallback, and add a safe demo seed that never runs automatically.
- README: Live demo section and a click-by-click deployment checklist, with a note about free-tier cold starts.
```

### 27. README, screenshots and GIF (do near the end)

```text
Feature: Make the repo look finished.

- Write a Playwright script that captures screenshots from a seeded database (dashboard, products, sale screen, receipt, and any ledger, warehouses or reports pages that exist) at 1440x900 plus one mobile shot. Save optimised images in docs/screenshots.
- Record a 15 to 25 second GIF of login, add product and a sale, under about 5 MB.
- README: tagline, badges, hero GIF, features, a Mermaid architecture diagram, tech table, quick start (local and Docker), demo credentials, tests, API docs link, roadmap. Only describe features that actually exist. Suggest a GitHub About description and topics; I will set those myself.
```

### 28. Retire the legacy templates

```text
Feature: Remove the old server-rendered views once the SPA covers everything.

- List every route in templates/ and static/ and map each to its React page. If any page has no SPA equivalent, stop and tell me.
- Remove the unused template views, URLs, templates and static files; keep Django admin and the API. Serve the built SPA from Django (WhiteNoise) with a fallback to index.html for deep links.
- Update the README, .gitignore and tests; make sure python manage.py check and all tests pass.

Edge cases: login and logout still work for the SPA, CSRF cookie is still set, the admin site still loads, deep links such as /products/12 work after a refresh.
```

## Build order and notes

**Suggested build order:** 22 and 21 first (CI and the concurrency test give a safe baseline on today's code), then 1, 2, 3, 4, 5, 6, 7, then 8, 9, 10, 11, then 12, 13, 14, 15, then 16 to 20 in any order, then 23 to 26, and 27 and 28 last so the screenshots and cleanup reflect the finished app.

- **Prompt 3 is the riskiest** because it changes how stock is stored. Run it on its own branch and check that stock and sales numbers still reconcile before merging.
- **Assumptions to confirm:** existing users become Staff in a default 'Main Warehouse' after prompt 1, so you promote managers yourself; Managers can create and edit products but only Admin deletes them; one manager per warehouse.
- **Replaces the older roles prompt:** prompts 1 to 7 supersede the Admin / Manager / Cashier prompt in the earlier feature docs.
- If a prompt is too big for one pass, tell Antigravity: "Do only the backend first and stop," then "Now do the frontend."
- After each prompt, ask it: "Review your own changes for bugs, security issues, and edge cases, and fix what you find."
- This review is based on the README and root file list only. If you want a deeper check, tell Antigravity to audit `sales/services.py` and `inventory/services.py` first (prompt 21 does this).
