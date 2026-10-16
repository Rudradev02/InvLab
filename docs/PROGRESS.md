# InvLab Feature Implementation Progress

Spec: [`docs/InvLab Repo Review and Feature Prompts.md`](./InvLab%20Repo%20Review%20and%20Feature%20Prompts.md)

Suggested Build Order: 22, 21, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 23, 24, 25, 26, 27, 28.

| # | Prompt Title | Status | Commit Hash | Notes |
|---|---|---|---|---|
| 22 | GitHub Actions CI | done | `daf2a67` | Two jobs (backend + frontend), PostgreSQL service, npm scripts |
| 21 | Concurrency test for overselling | done | `aab8a9e` | TransactionTestCase with threads & barrier on PostgreSQL |
| 1 | Warehouses, roles and scoping | done | `11b4a27` | Multi-warehouse, roles, scoping mixin & permission classes, Can auth guard |
| 2 | Stock movement ledger | done | `eb4f7f2` | Immutable StockMovement ledger, balance_after, reason, and product history |
| 3 | Separate stock per warehouse | done | `ef041f8` | StockLevel per warehouse + product, cached Product.stock sync, warehouse breakdown UI |
| 4 | Admin panel with a Warehouses overview | done | `aae2706` | Warehouses & Users CRUD, overview analytics, stock chart, 5-tab detail modal |
| 5 | Warehouse Manager workspace | done | `6e8bce6` | Manager scoped views, stock CRUD, staff management, warehouse contact card |
| 6 | Staff workspace | done | `eca485a` | Scoped sales and stock views, receive/adjust dialogs, required reason, idempotency |
| 7 | Stock transfers between warehouses | done | `18c8f80` | StockTransfer draft/dispatch/receive, variance shortfall, in-transit cancellation, deadlock-free locking, TransfersPage UI |
| 8 | Returns and refunds | done | `1054769` | SaleReturn & SaleReturnLine, immutable sales, line returnable tracking, ledger stock restore, printable return voucher |
| 9 | Customers and credit balance | done | `f9ca344` | Customer & Payment models, udhaar credit balances, FIFO oldest-sales allocation, CustomersPage UI, SalesPage customer selector & udhaar preview, Dashboard receivables KPI |
| 10 | Discounts and payment methods | done | `5544902` | Subtotal, flat/percent discount, staff 10% limit check, payment methods (Cash, UPI, Card, Credit/Udhaar), receipt breakdown & filters |
| 11 | Reports with exports | done | `a5aa808` | Report registry, 4 reports (sales summary, sales by product, stock list, low stock), CSV stream with injection safety, openpyxl Excel, ReportLab PDF, Asia/Kolkata boundaries, ReportsPage UI |
| 12 | Suppliers and purchase orders | done | `d48968a` | Suppliers directory, PurchaseOrder lifecycle (draft/ordered/partially_received/received/cancelled), partial receipts with over-receiving guards, weighted-average cost accounting, PurchasingPage UI |
| 13 | Profit tracking | todo | - | Cost price snapshots, gross margin & profit metrics |
| 14 | GST-ready invoices | todo | - | CGST, SGST, IGST tax invoice calculations & numbering |
| 15 | Barcode and QR scanning | todo | - | Product barcode lookup, scanner UI |
| 16 | Low-stock emails and daily summary | todo | - | Email notifications on reorder threshold |
| 17 | Product images | todo | - | Product image upload & thumbnail (Ask first on storage) |
| 18 | Batch and expiry tracking | todo | - | FEFO batch deduction & expiry alerts |
| 19 | Dark mode | todo | - | Full dark token palette & theme switcher |
| 20 | Global search (Ctrl+K) | todo | - | Command palette for navigation & entities |
| 23 | Frontend tests and a Playwright flow | todo | - | Vitest component tests & Playwright E2E spec |
| 24 | Docker and docker-compose | todo | - | Multi-stage Dockerfile & compose orchestration |
| 25 | Rate limiting and security headers | todo | - | DRF throttles, CSP, security headers |
| 26 | Live deployment | todo | - | Render / Railway config (Ask first) |
| 27 | README, screenshots and GIF | todo | - | Polished README, screenshots & demo animation |
| 28 | Retire the legacy templates | todo | - | Clean up old server-rendered templates/static |
