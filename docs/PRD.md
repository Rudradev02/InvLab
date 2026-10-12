# Product Requirements Document (PRD)

| | |
| --- | --- |
| Product | InvLab |
| Version | 0.1 (draft) |
| Date | 2026-10-12 |
| Owner | Rudra Kumbhani |
| Related | [FRD.md](FRD.md), [TRD.md](TRD.md), [ROADMAP.md](ROADMAP.md) |

## 1. Overview

InvLab is a web application that lets a business with one or more warehouses or shops track stock, record sales and see how each location is performing. Stock is kept separately for each warehouse. Every change to stock leaves a record. Three roles, Admin, Warehouse Manager and Staff, decide who can see and change what.

## 2. Problem

Small and mid-size businesses in India often run several shops or godowns on notebooks, spreadsheets or a single-location billing tool. That causes four recurring problems:

1. **Nobody knows true stock.** Counts differ between locations, and a sale can be made for an item that is already gone.
2. **No accountability.** When stock goes missing there is no record of who changed what, or why.
3. **No single view.** The owner has to phone each location to learn what is in stock and what sold.
4. **No control.** Counter staff can often change prices or delete records.

## 3. Vision

One system where the owner sees every warehouse at a glance, each manager runs their own warehouse, and counter staff can sell and receive stock quickly without being able to break anything.

## 4. Users

The personas below are fictional and represent the real roles.

| Persona | Role | Context | Needs | Frustrations today |
| --- | --- | --- | --- | --- |
| Meera, owner of three stores | Admin | Checks in from her phone and laptop; not at the counter | Consolidated view, control over who can do what, trust in the numbers | Calling managers for stock counts; surprises at month end |
| Imran, runs one warehouse | Warehouse Manager | Manages 3 to 5 staff and supplier deliveries | Accurate stock, simple staff management, easy restocking and transfers | Counts that never match; staff mistakes he cannot trace |
| Dev, counter operator | Staff | Serves customers all day; limited training | A fast sale screen, simple stock receiving, few ways to make mistakes | Slow software, screens he is afraid to touch |

## 5. Goals

| ID | Goal |
| --- | --- |
| G1 | Stock for every product is accurate per warehouse, and the system can prove it with a ledger |
| G2 | A sale can be recorded in under 30 seconds and can never oversell stock, even when two people sell at once |
| G3 | The Admin sees every warehouse with its manager, staff, address, stock and sales in one section |
| G4 | Each role sees and changes only what it should, enforced on the server |
| G5 | Stock can move between warehouses with a clear, auditable flow |
| G6 | Secondary: the project demonstrates production-grade engineering (tests, CI, security, documentation) |

## 6. Non-goals

- Accounting, payroll, or filing GST returns (invoice formatting is in scope later; filing is not)
- An online storefront or customer-facing app
- Multiple companies in one installation (multi-tenant SaaS)
- Native mobile apps (the web app must work on phones, but it is one web app)
- Fractional units such as 2.5 kg in the first release (quantities are whole numbers)
- Hardware integrations beyond camera and keyboard-style barcode scanners

## 7. Principles

1. **The server decides.** Stock, totals and permissions are always computed and enforced on the server.
2. **Nothing disappears.** Records with history are deactivated, never deleted. Stock changes are append-only.
3. **Fast for the counter, clear for the owner.** Staff screens are minimal; Admin screens are rich.
4. **Quiet and legible.** Dense, calm interface with plain language and few decorations.

## 8. Scope by release

| Release | Contents |
| --- | --- |
| **v1.0 (MVP)** | Login and sessions; roles and warehouse scoping; warehouses and users management; categories and products; per-warehouse stock with receive and adjust; stock ledger; sales and receipts; role-specific dashboards; Admin warehouse overview; stock transfers; in-app low-stock indicators |
| **v1.1** | Customers and credit balances; discounts and payment methods; returns and refunds; reports with CSV, Excel and PDF export; GST-ready invoices; suppliers and purchase orders; profit tracking |
| **v1.2** | Barcode and QR scanning; low-stock emails and daily summary; product images; batch and expiry tracking; dark mode; command palette and global search |

Release detail and ordering are in [ROADMAP.md](ROADMAP.md).

## 9. Key user journeys

**J1: Record a sale (Staff).** Sign in, open New sale, search for a product by name or SKU, set the quantity, repeat, review the total, confirm. The stock drops and a receipt can be printed.

**J2: Receive a delivery (Staff or Manager).** Open Stock, choose Receive, pick the product, enter the quantity and a reference note, confirm. The stock rises and the ledger records it.

**J3: Fix a miscount (Staff or Manager).** Open the product's stock, choose Adjust, enter the new quantity or the difference, give a reason, confirm. The ledger shows who did it and why.

**J4: Review all warehouses (Admin).** Open Warehouses and see a card or row for each: manager, staff count, address, units, low stock and sales. Open one for tabs on staff, stock, sales, transfers and ledger.

**J5: Move stock between warehouses (Manager).** Create a transfer to another warehouse, pick products and quantities, dispatch. The destination manager confirms receipt with the quantities that arrived. Any difference is recorded.

**J6: Onboard a staff member (Manager or Admin).** Create the user, assign the warehouse and role, share the first password; the user must change it at first sign-in.

## 10. User stories (v1.0)

| ID | As a | I want to | So that |
| --- | --- | --- | --- |
| US-01 | Admin | create and edit warehouses with address and contact details | each location is represented accurately |
| US-02 | Admin | assign one manager to each warehouse | there is a clear person in charge |
| US-03 | Admin | create users, set their role and warehouse, and deactivate them | I control who has access |
| US-04 | Admin | see all warehouses with manager, staff, address, stock and sales | I know the state of the business without calling anyone |
| US-05 | Admin | filter any dashboard or list by warehouse | I can focus on one location |
| US-06 | Admin | manage products and categories, including deleting unused ones | the catalogue stays clean |
| US-07 | Manager | see only my warehouse's data | I focus on my job and other warehouses stay private |
| US-08 | Manager | add products to my warehouse and set reorder levels | stock alerts match how this warehouse works |
| US-09 | Manager | create and deactivate Staff accounts for my warehouse | I can manage my team without the Admin |
| US-10 | Manager | create and edit products, but not delete them | I can keep the catalogue current without risk |
| US-11 | Manager | start a transfer to another warehouse and confirm incoming ones | stock moves with a record |
| US-12 | Manager | review the stock ledger for my warehouse | I can trace any discrepancy |
| US-13 | Staff | record a sale quickly | customers are not kept waiting |
| US-14 | Staff | receive stock and adjust it with a reason | counts stay correct without bothering the manager |
| US-15 | Staff | see my own sales | I can check what I did |
| US-16 | Any user | be blocked from selling more than what is in stock | stock never goes negative |
| US-17 | Any user | see which items are low on stock | I can act before running out |
| US-18 | Any user | sign in securely and change my password | my account is protected |

## 11. Success metrics

| Metric | Target | How it is measured |
| --- | --- | --- |
| Oversold units in concurrency tests | 0 | Automated test with parallel sales on the last unit |
| Ledger reconciliation | 100% of stock levels equal the sum of their movements | Automated check and test |
| Time to record a 3-item sale | 30 seconds or less | Scripted walkthrough with seeded data |
| List endpoint speed | p95 under 300 ms | Load script with 10,000 products and 100,000 movements |
| Service-layer test coverage | 85% or higher | Coverage report in CI |
| Accessibility | Lighthouse 95 or higher; no serious axe violations | CI and manual audit |
| Cross-warehouse leaks | 0 | Permission-matrix tests for every endpoint |

## 12. Assumptions and constraints

- One organisation per installation. A user belongs to at most one warehouse; the Admin belongs to none.
- Each warehouse has at most one manager.
- Products and prices form one shared catalogue; stock is per warehouse.
- Quantities are whole numbers; money is in INR with two decimals.
- Users have a modern browser and a connection that is usually online. Offline mode is out of scope.
- Hosting uses free or low-cost tiers, so cold starts are acceptable.

## 13. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Race conditions oversell stock | Wrong stock, lost trust | Row locking inside transactions; database check constraint; concurrency tests on PostgreSQL |
| Cross-warehouse data leaks | Privacy and trust | One shared scoping layer; 404 for foreign records; matrix tests |
| Scope grows before the core is solid | Delay | Strict release scoping; v1.0 is the only commitment |
| Stock model changes late | Costly rework | Per-warehouse stock designed in from day one |
| Free-tier limits and cold starts | Slow first load | Health check, documented expectation, optional paid tier |

## 14. Open questions

| # | Question | Default if unanswered |
| --- | --- | --- |
| Q1 | Should a Manager be able to override a product's selling price on a sale? | No |
| Q2 | Should Staff see the ledger for their own actions? | No (Manager and Admin only) |
| Q3 | Should sales be voidable before returns exist (v1.1)? | No; use stock adjustment plus a note until returns ship |
| Q4 | Is one invoice series per warehouse acceptable for GST? | Yes, per warehouse and financial year |
| Q5 | Which licence? | Decide before public release |
