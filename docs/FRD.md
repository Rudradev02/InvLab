# Functional Requirements Document (FRD)

| | |
| --- | --- |
| Product | InvLab |
| Version | 0.1 (draft) |
| Date | 2026-10-12 |
| Related | [PRD.md](PRD.md), [API.md](API.md), [DATABASE.md](DATABASE.md) |

## 1. How to read this document

- Requirement IDs look like `FR-STK-004`. The middle part is the module.
- Priority: **Must** (required for the release), **Should** (important, can slip), **Could** (nice to have).
- Release: v1.0 unless stated otherwise.
- "Own warehouse" means the warehouse the signed-in user belongs to. The Admin has no warehouse and can act in any.
- Business rules (`BR-xx`) apply across modules.

## 2. Roles

| Role | Warehouse | Summary |
| --- | --- | --- |
| Admin | None (sees all) | Owns the system: warehouses, users, catalogue, everything |
| Warehouse Manager | Exactly one | Runs one warehouse: stock, staff, sales, transfers |
| Staff | Exactly one | Counter and receiving work in one warehouse |

## 3. Business rules

| ID | Rule |
| --- | --- |
| BR-01 | Stock quantity can never be negative. This is enforced in the service layer and by a database check constraint. |
| BR-02 | There is exactly one stock level per product and warehouse. A missing stock level means zero stock. |
| BR-03 | Every change to stock creates exactly one stock movement in the same database transaction. If the transaction fails, neither exists. |
| BR-04 | Stock movements are append-only. They are never edited or deleted; corrections are new movements. |
| BR-05 | Every Manager and Staff user belongs to exactly one warehouse. The Admin belongs to none. |
| BR-06 | A warehouse has at most one manager. |
| BR-07 | A non-Admin user can only read or change records of their own warehouse. A record of another warehouse is reported as not found (404), not forbidden. |
| BR-08 | Sale totals are calculated on the server from the product price at the time of sale. The price is copied onto the sale line and never changes afterwards. |
| BR-09 | Records that have history (products, warehouses, users, categories with products) are deactivated, not deleted. Only unused records can be deleted, and only by the Admin. |
| BR-10 | Stock transfers conserve stock: the source loses stock when the transfer is dispatched, the destination gains stock when it is received, and any shortfall is recorded as a variance. |
| BR-11 | When several stock rows are locked in one transaction, they are locked in a fixed order (by warehouse id, then product id) to avoid deadlocks. |
| BR-12 | The last active Admin cannot be demoted or deactivated. Nobody can change their own role or deactivate themselves. |
| BR-13 | Times are stored in UTC and shown in Asia/Kolkata. Money uses two decimals and is shown as ₹ with Indian digit grouping (for example ₹1,25,000.00). |
| BR-14 | Sensitive actions (role or warehouse changes, user activation, deletions, stock adjustments, transfers) are written to an audit log with who, when and what changed. |
| BR-15 | A deactivated warehouse cannot receive sales, stock changes or transfers. Its users cannot sign in to operate on it. |

## 4. Permission matrix

| Capability | Staff | Warehouse Manager | Admin |
| --- | --- | --- | --- |
| View products and stock | Own warehouse | Own warehouse | All warehouses |
| Record sales | Own warehouse | Own warehouse | Any warehouse |
| View sales | Own sales | Own warehouse | All |
| Receive stock | Own warehouse | Own warehouse | Any warehouse |
| Adjust stock | Own warehouse | Own warehouse | Any warehouse |
| View stock ledger | No | Own warehouse | All |
| Add a product to a warehouse, set reorder level | No | Own warehouse | Any warehouse |
| Create and edit products and categories | No | Yes | Yes |
| Delete products and categories | No | No | Yes |
| Manage staff accounts | No | Staff of own warehouse | All users |
| Create, edit, deactivate warehouses; assign managers | No | No | Yes |
| Start transfers (dispatch) | No | From own warehouse | Any |
| Confirm incoming transfers | No | Into own warehouse | Any |
| Dashboard | Own, simple | Own warehouse | All, with warehouse filter |
| Warehouses overview | No | Own warehouse card only | Yes |
| View audit log | No | No | Yes |

Releases v1.1 and v1.2 extend this matrix; see section 7.

## 5. Functional requirements (v1.0)

### 5.1 Authentication (AUTH)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-AUTH-001 | Users sign in with username and password using a server-side session. | Must |
| FR-AUTH-002 | Sign out ends the session immediately on the server. | Must |
| FR-AUTH-003 | The app asks the server who the current user is (role, warehouse, permissions) at start-up and after sign-in. | Must |
| FR-AUTH-004 | Users can change their own password by giving the current one. New passwords follow the password policy. | Must |
| FR-AUTH-005 | Users created by an Admin or Manager must change their password at first sign-in. | Should |
| FR-AUTH-006 | Repeated failed sign-ins are rate-limited and show a plain message with the time to retry. | Must |
| FR-AUTH-007 | An expired or invalid session redirects to the sign-in page and returns the user to where they were afterwards. | Must |
| FR-AUTH-008 | A deactivated user cannot sign in, and their existing sessions end at once. | Must |

### 5.2 Warehouses (WH)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-WH-001 | The Admin can create a warehouse with name, unique code, address (two lines, city, state, pincode), phone and email. | Must |
| FR-WH-002 | The Admin can edit a warehouse and assign or change its manager. | Must |
| FR-WH-003 | A warehouse with stock, sales, staff or pending transfers cannot be deleted. It can be deactivated if it has no pending transfers. | Must |
| FR-WH-004 | The Admin sees a **Warehouses** section listing every warehouse with: name, code, address, phone, manager (name, phone, email), staff count, products stocked, total units, low-stock count, sales today and in the last 30 days, pending transfers and last activity. | Must |
| FR-WH-005 | The list supports search by name or code, a status filter (active or inactive) and sorting by any numeric column. | Should |
| FR-WH-006 | A warehouse detail page has tabs: Overview, Staff, Stock, Sales, Transfers and Ledger. | Must |
| FR-WH-007 | The Warehouses section includes a chart comparing stock units and sales across warehouses. | Should |
| FR-WH-008 | A Manager sees a read-only card of their own warehouse (address, contact, staff) on their dashboard. | Should |
| FR-WH-009 | Stock value per warehouse is shown only when cost prices exist (v1.1). | Could |

### 5.3 Users (USR)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-USR-001 | The Admin can create users with name, username, email, role and warehouse, and set a first password. | Must |
| FR-USR-002 | The Admin can edit a user, change role or warehouse, reset a password, and activate or deactivate the user. | Must |
| FR-USR-003 | A Manager can create, edit and deactivate Staff of their own warehouse only. They cannot create Managers or Admins or move users to another warehouse. | Must |
| FR-USR-004 | Users with history are deactivated, never deleted. | Must |
| FR-USR-005 | Moving a user to another warehouse keeps their old records attached to the old warehouse. | Must |
| FR-USR-006 | The user list shows name, role, warehouse, status and last sign-in, with search and filters. | Should |
| FR-USR-007 | Role, warehouse and activation changes are written to the audit log. | Must |

### 5.4 Catalogue (CAT)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-CAT-001 | Admin and Manager can create, edit and deactivate categories. Only the Admin can delete an unused category. | Must |
| FR-CAT-002 | Admin and Manager can create and edit products: name, unique SKU, category, unit label, selling price and default reorder level. | Must |
| FR-CAT-003 | Only the Admin can delete a product, and only if it has no stock movements or sales. Otherwise it is deactivated. | Must |
| FR-CAT-004 | Product lists support search by name or SKU, category filter, sort and pagination. | Must |
| FR-CAT-005 | A product list shows the quantity for the user's warehouse. The Admin sees per-warehouse quantities in the product detail and the selected warehouse in lists. | Must |
| FR-CAT-006 | Changing a product's price affects only future sales. | Must |
| FR-CAT-007 | Deactivated products cannot be sold or received but stay visible in history. | Must |

### 5.5 Stock (STK)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-STK-001 | A Manager or Admin can add a product to a warehouse (creating its stock level) and set its reorder level there. | Must |
| FR-STK-002 | Any role can **receive** stock into their warehouse: product, quantity (1 or more), optional reference note. Stock rises and a `receive` movement is recorded. | Must |
| FR-STK-003 | Any role can **adjust** stock in their warehouse by entering a new counted quantity or a signed difference, with a required reason. The result cannot be below zero. A `adjustment` movement is recorded. | Must |
| FR-STK-004 | Each stock movement stores product, warehouse, signed quantity change, type, reason or note, reference, user, resulting balance and time. | Must |
| FR-STK-005 | The ledger page lists movements with filters (product, type, user, date range) and pagination. Manager sees their warehouse, Admin sees all with a warehouse filter. | Must |
| FR-STK-006 | A product's detail page has a Ledger tab for that product. | Should |
| FR-STK-007 | Stock status is shown with a label and colour: In stock, Low (at or below reorder level), Out of stock. Colour is never the only signal. | Must |
| FR-STK-008 | A low-stock list is available per warehouse and for the Admin across warehouses. | Must |
| FR-STK-009 | Submitting the same receive or adjust request twice by double-click must not apply it twice. | Must |
| FR-STK-010 | The system can run a reconciliation check that compares every stock level with the sum of its movements and reports differences. | Should |

### 5.6 Sales (SAL)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-SAL-001 | A **New sale** screen lets the user find products by name or SKU, set quantities and see line totals and a grand total as they work. | Must |
| FR-SAL-002 | Confirming a sale checks stock on the server under row locks, deducts stock, records movements and stores the sale in one transaction. | Must |
| FR-SAL-003 | If any line lacks stock, the whole sale is rejected and the message names the product and the available quantity. Nothing is saved. | Must |
| FR-SAL-004 | Each sale gets a sequential number per warehouse and financial year, such as `MUM01/2026-27/000123`. | Must |
| FR-SAL-005 | A sale stores the user, warehouse, time and, for each line, the product, quantity, unit price and line total. | Must |
| FR-SAL-006 | A printable receipt is available straight after the sale and later from the sale detail. | Must |
| FR-SAL-007 | Sales history lists sales with search by number, date range filter and pagination. Staff see only their own; Manager sees their warehouse; Admin sees all with a warehouse filter. | Must |
| FR-SAL-008 | Sale detail shows lines, totals, who sold, when and which warehouse. | Must |
| FR-SAL-009 | Submitting a sale twice by double-click must create one sale (idempotency key). | Should |
| FR-SAL-010 | Sold quantity must be a whole number of 1 or more, and the same product appears once per sale (quantities are merged). | Must |
| FR-SAL-011 | Selling prices cannot be changed on the sale screen in v1.0. | Must |

### 5.7 Transfers (TRF)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-TRF-001 | A Manager (or Admin) can create a transfer from their warehouse to another active warehouse with one or more products and quantities. It starts as `draft`. | Must |
| FR-TRF-002 | Dispatching a draft checks and deducts stock from the source, records `transfer_out` movements and moves the transfer to `in_transit`. | Must |
| FR-TRF-003 | The destination Manager (or Admin) receives an in-transit transfer by entering the quantity that arrived per line. Stock is added to the destination with `transfer_in` movements and the transfer becomes `received`. | Must |
| FR-TRF-004 | If received quantity is less than sent, the difference is saved as a variance on the line and shown to the Admin. It is not added to any stock. Receiving more than sent is rejected. | Must |
| FR-TRF-005 | A draft can be cancelled. An in-transit transfer can be cancelled by the source Manager or Admin, which returns the stock to the source with `transfer_cancel` movements. | Must |
| FR-TRF-006 | A transfer can only be received once. | Must |
| FR-TRF-007 | A transfer cannot have the same source and destination, and cannot involve an inactive warehouse. | Must |
| FR-TRF-008 | The Transfers page has tabs for Outgoing, Incoming and (Admin) All, with status chips and a timeline on the detail page. | Must |
| FR-TRF-009 | The destination Manager sees a count of incoming transfers waiting for receipt on their dashboard. | Should |

### 5.8 Dashboards (DASH)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-DASH-001 | **Admin dashboard:** KPIs (revenue and sales for the period, units in stock, low-stock items, pending transfers), revenue trend with 7, 30 and 90 day ranges, revenue and stock by warehouse, recent sales, low-stock list with warehouse. A warehouse filter narrows everything. | Must |
| FR-DASH-002 | **Manager dashboard:** the same measures for their warehouse, plus incoming transfers and recent staff activity. | Must |
| FR-DASH-003 | **Staff dashboard:** today's own sales count and total, a New sale shortcut, a Receive stock shortcut, and low-stock items in their warehouse. | Must |
| FR-DASH-004 | Period comparisons (for example versus the previous period) appear only when there is enough history. | Should |
| FR-DASH-005 | Every chart handles an empty dataset with a clear message and shows values in a tooltip. | Must |
| FR-DASH-006 | Dashboard figures must equal figures computed from the underlying sales and stock records. | Must |

### 5.9 Audit (AUD)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-AUD-001 | An audit log stores actor, action, target, before and after values for the actions in BR-14. | Must |
| FR-AUD-002 | The Admin can view and filter the audit log by user, action and date. | Should |
| FR-AUD-003 | Audit entries cannot be edited or deleted through the application. | Must |

### 5.10 Interface behaviour (UX)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-UX-001 | Navigation shows only the pages the current role can use. Opening a forbidden URL shows a clear "you don't have access" page. | Must |
| FR-UX-002 | Every data screen has loading, empty and error states with a way to retry. | Must |
| FR-UX-003 | Every destructive or irreversible action asks for confirmation that names what will happen. | Must |
| FR-UX-004 | Success and failure of an action is shown with a short message that uses the same verb as the button. | Must |
| FR-UX-005 | The layout works from 360 px wide phones to wide desktops; the sale screen is usable one-handed on a phone. | Must |
| FR-UX-006 | All functions can be used with a keyboard, with visible focus. | Must |

## 6. Validation rules

| Field | Rule |
| --- | --- |
| Username | 3 to 30 characters; letters, digits, dot, dash, underscore; unique, case-insensitive |
| Password | At least 10 characters; not entirely numeric; not a common password; not similar to the username |
| Email | Valid format; required for Admin and Manager, optional for Staff |
| Warehouse code | 2 to 10 uppercase letters or digits; unique |
| Pincode | 6 digits |
| Phone | 10-digit Indian mobile number, with optional +91 |
| SKU | 2 to 40 characters; letters, digits, dash, underscore, slash; unique, case-insensitive |
| Product name | 2 to 120 characters |
| Price | Greater than 0; at most 2 decimals; at most 9,999,999.99 |
| Quantity (receive, sell, transfer) | Whole number from 1 to 1,000,000 |
| Counted quantity (adjust) | Whole number from 0 to 1,000,000 |
| Reason or note | Required for adjustments (3 to 200 characters); optional elsewhere |

Validation runs in the browser for speed and again on the server, which is the authority.

## 7. Later releases

### 7.1 v1.1

| Module | Key requirements | Roles |
| --- | --- | --- |
| Customers (CUS) | Customer records (name, unique phone, optional email, GSTIN, address); purchase history; lifetime value; deactivate instead of delete | Staff create and view; Manager and Admin edit |
| Payments and credit (PAY) | Discount (amount or percent, capped; Staff limited to a configured maximum); payment method (cash, UPI, card, credit); amount paid and balance due; credit needs a customer; customer payments clear the oldest balances first; receivables total | Staff in own warehouse |
| Returns (RET) | Full or partial return against a sale; quantity capped at returnable; stock restored with `return` movements; refund based on price actually paid; credit balance reduced first | Manager (own), Admin |
| Reports (RPT) | Sales summary, sales by product and category, stock list, low-stock list, receivables, returns, profit; date filters; CSV, Excel and PDF export whose totals match the database | Manager (own), Admin |
| GST invoices (GST) | Business settings with GSTIN; per-product GST rate and HSN; CGST and SGST or IGST by place of supply; round-off; amount in words; sequential numbering per warehouse and financial year; PDF download | Admin configures; all roles issue |
| Suppliers and purchase orders (PO) | Supplier records; orders with draft, ordered, partially received, received, cancelled; receiving adds stock and updates cost with weighted average | Manager (own), Admin |
| Profit (PRF) | Cost price on products; cost copied onto each sale line; margin per product; profit on dashboards; unknown cost is flagged, never treated as zero | Manager (own), Admin |

### 7.2 v1.2

| Module | Key requirements |
| --- | --- |
| Barcode (BAR) | Optional unique barcode per product; camera, USB and manual entry on the sale screen; unknown barcode offers a shortcut to add the product |
| Notifications (NOT) | Email when stock first drops to its reorder level; daily summary command; in-app bell with live low-stock and overdue items |
| Images (IMG) | Optional product image with type and size validation and thumbnails |
| Batches (BAT) | Optional batch and expiry per product; earliest-expiry-first deduction; expiring-soon panel |
| Theme (THM) | Dark theme with the same tokens, contrast of at least 4.5:1, no flash on load |
| Search (SRCH) | Command palette (Ctrl or Cmd + K) with permission-aware search across products, sales and customers, and quick actions |

## 8. Key workflows

### 8.1 Record a sale

1. Staff opens New sale. The warehouse is their own; the Admin chooses one first.
2. Staff searches a product and adds it. Adding it again increases the quantity.
3. The screen shows line totals and a grand total (display only).
4. Staff confirms. The server locks the stock rows, checks quantities, deducts stock, writes movements, numbers the sale and saves it.
5. On success the receipt opens. On a stock shortfall the sale is rejected with the product and available quantity, and the screen keeps the lines so the user can adjust.

### 8.2 Adjust stock

1. User opens a product's stock row and chooses Adjust.
2. User enters the counted quantity, sees the difference, and gives a reason.
3. The server locks the stock row, applies the change, writes an `adjustment` movement with the user and reason, and writes an audit entry.

### 8.3 Transfer stock

1. Source Manager creates a draft transfer with destination, products and quantities.
2. Source Manager dispatches: stock leaves the source, status becomes `in_transit`.
3. Destination Manager opens the incoming transfer and enters received quantities.
4. Stock arrives at the destination; any shortfall is stored as variance; status becomes `received`.
5. Admin can see every transfer and every variance.

## 9. Messages

Messages say what happened and what to do next, in plain language and sentence case.

| Situation | Message |
| --- | --- |
| Not enough stock | "Only 4 units of Steel Rack are available in Pune Warehouse. Reduce the quantity or receive more stock." |
| Forbidden action | "You don't have access to this. Ask your Admin if you need it." |
| Foreign warehouse record | "We couldn't find that record." |
| Too many sign-in attempts | "Too many attempts. Try again in 5 minutes." |
| Sale saved | "Sale MUM01/2026-27/000123 saved." |
| Adjustment saved | "Stock adjusted to 18 units." |

## 10. Acceptance criteria (examples)

**Overselling**
- Given a product with 1 unit in a warehouse, when two Staff users confirm a sale of 1 unit at the same moment, then exactly one sale succeeds, the other is rejected with a stock message, and stock is 0.

**Warehouse isolation**
- Given a Manager of warehouse A, when they request a sale from warehouse B by its id, then the response is 404 and nothing from B is returned in any list.

**Adjustments**
- Given 20 units in stock, when Staff adjusts to 18 with the reason "damaged in storage", then stock is 18, one movement of -2 exists with that reason and user, and the ledger balance reads 18.

**Transfers**
- Given 10 units in warehouse A and 0 in B, when A dispatches 10 and B receives 8, then A has 0, B has 8, the transfer shows a variance of 2, and the total stock across warehouses is 8.

**Admin overview**
- Given three warehouses with managers and staff, when the Admin opens Warehouses, then each shows its manager's name, staff count, address, units, low-stock count and recent sales, and the figures match the underlying records.
