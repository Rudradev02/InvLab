# API Reference

| | |
| --- | --- |
| Product | InvLab |
| Version | 0.1 (draft) |
| Date | 2026-10-12 |
| Base path | `/api/v1/` |
| Live schema | `/api/docs/` (Swagger UI) and `/api/schema/` (OpenAPI) once built |

This file defines conventions and the planned endpoints. The generated OpenAPI schema is the source of truth once the code exists; if they differ, fix the code or this file in the same pull request.

## 1. Conventions

### Authentication

- Session cookie authentication. `POST /auth/login/` sets the session.
- Writes (`POST`, `PUT`, `PATCH`, `DELETE`) need the CSRF token in the `X-CSRFToken` header. Fetch it with `GET /auth/csrf/`, which also sets the CSRF cookie.
- No unauthenticated endpoint except `/auth/csrf/`, `/auth/login/` and `/healthz/`.

### Scoping

- Managers and Staff only ever see their own warehouse's data.
- The Admin can add `?warehouse=<id>` to narrow lists and dashboards.
- A record from another warehouse returns `404`.

### Pagination

`?page=1&page_size=25` (default 25, maximum 100).

```json
{ "count": 132, "next": "…?page=2", "previous": null, "results": [ ] }
```

### Filtering, search and ordering

- Filters are plain query parameters, for example `?category=3&status=low`.
- `?search=` searches the fields named for each endpoint.
- `?ordering=name` or `?ordering=-created_at`.
- Dates use ISO 8601. Date-range filters are `date_from` and `date_to` (inclusive, Asia/Kolkata days).

### Errors

All errors share one shape:

```json
{
  "error": {
    "code": "insufficient_stock",
    "message": "Only 4 units of Steel Rack are available in Pune Warehouse.",
    "fields": { "lines[0].quantity": ["Only 4 units are available."] },
    "details": { "product_id": 12, "available": 4 }
  }
}
```

| HTTP | Meaning | Example codes |
| --- | --- | --- |
| 400 | Invalid input | `validation_error` |
| 401 | Not signed in | `not_authenticated` |
| 403 | Signed in but not allowed | `permission_denied` |
| 404 | Not found, or in another warehouse | `not_found` |
| 409 | Conflicts with current state | `insufficient_stock`, `invalid_transition`, `already_received` |
| 429 | Rate limited, with `Retry-After` | `throttled` |
| 500 | Unexpected error, with a request id | `server_error` |

### Idempotency

`POST /sales/`, `/stock/receive/` and `/stock/adjust/` accept an `Idempotency-Key` header (any unique string, up to 64 characters). Repeating a request with the same key and user returns the original result instead of applying it again.

### Formats

- Money is a string with two decimals, for example `"1250.00"`.
- Quantities are integers.
- Timestamps are UTC ISO 8601 strings; the app displays them in Asia/Kolkata.

## 2. Endpoints (v1.0)

Roles: **A** Admin, **M** Warehouse Manager, **S** Staff. "own" means own warehouse.

### Auth

| Method and path | Purpose | Roles |
| --- | --- | --- |
| GET `/auth/csrf/` | Set the CSRF cookie | Anyone |
| POST `/auth/login/` | Sign in | Anyone |
| POST `/auth/logout/` | Sign out | A M S |
| GET `/auth/me/` | Current user, role, warehouse and permissions | A M S |
| POST `/auth/change-password/` | Change own password | A M S |

### Warehouses

| Method and path | Purpose | Roles |
| --- | --- | --- |
| GET `/warehouses/` | List (Admin: all; others: own) | A M S |
| POST `/warehouses/` | Create | A |
| GET `/warehouses/{id}/` | Detail | A, M (own) |
| PATCH `/warehouses/{id}/` | Edit, assign manager | A |
| POST `/warehouses/{id}/deactivate/` | Deactivate | A |
| GET `/warehouses/overview/` | All warehouses with manager, staff, address, units, low stock, sales, pending transfers | A |
| GET `/warehouses/{id}/summary/` | One warehouse's KPIs and tab data | A, M (own) |

### Users

| Method and path | Purpose | Roles |
| --- | --- | --- |
| GET `/users/` | List (Admin: all; Manager: own warehouse's staff) | A M |
| POST `/users/` | Create | A; M (Staff of own warehouse only) |
| GET `/users/{id}/` | Detail | A, M (own staff) |
| PATCH `/users/{id}/` | Edit, change role or warehouse | A; M (own staff, not role or warehouse) |
| POST `/users/{id}/deactivate/` and `/activate/` | Change status | A; M (own staff) |
| POST `/users/{id}/reset-password/` | Set a new temporary password | A; M (own staff) |

### Catalogue

| Method and path | Purpose | Roles |
| --- | --- | --- |
| GET `/categories/` | List | A M S |
| POST `/categories/`, PATCH `/categories/{id}/` | Create, edit | A M |
| DELETE `/categories/{id}/` | Delete if unused | A |
| GET `/products/` | List with quantity for the scoped warehouse; search `name`, `sku` | A M S |
| POST `/products/`, PATCH `/products/{id}/` | Create, edit | A M |
| DELETE `/products/{id}/` | Delete if no history | A |
| GET `/products/{id}/` | Detail with per-warehouse stock (Admin) | A M S |

### Stock

| Method and path | Purpose | Roles |
| --- | --- | --- |
| GET `/stock-levels/` | Stock rows for the scoped warehouse; filters `product`, `status=low\|out\|ok` | A M S |
| POST `/stock-levels/` | Add a product to a warehouse | A M |
| PATCH `/stock-levels/{id}/` | Change reorder level | A M |
| POST `/stock/receive/` | Receive stock | A M S |
| POST `/stock/adjust/` | Adjust stock, reason required | A M S |
| GET `/stock-movements/` | Ledger; filters `product`, `type`, `user`, `date_from`, `date_to` | A M |
| GET `/products/{id}/movements/` | Product ledger | A M |
| GET `/stock-levels/low/` | Low-stock list | A M S |

### Sales

| Method and path | Purpose | Roles |
| --- | --- | --- |
| POST `/sales/` | Confirm a sale | A M S |
| GET `/sales/` | History; Staff see own, Manager own warehouse, Admin all | A M S |
| GET `/sales/{id}/` | Detail with lines | A M S (scoped) |
| GET `/sales/{id}/receipt/` | Receipt data for printing | A M S (scoped) |

### Transfers

| Method and path | Purpose | Roles |
| --- | --- | --- |
| GET `/transfers/` | List; `direction=outgoing\|incoming` | A M |
| POST `/transfers/` | Create a draft | A M (source = own) |
| GET `/transfers/{id}/` | Detail with timeline | A M (involved) |
| POST `/transfers/{id}/dispatch/` | Send; stock leaves the source | A M (source) |
| POST `/transfers/{id}/receive/` | Receive with quantities; variance recorded | A M (destination) |
| POST `/transfers/{id}/cancel/` | Cancel; returns stock if in transit | A M (source) |

### Dashboard, audit and system

| Method and path | Purpose | Roles |
| --- | --- | --- |
| GET `/dashboard/` | Role-aware KPIs and charts; `range=7d\|30d\|90d` | A M S |
| GET `/audit-log/` | Filterable audit entries | A |
| GET `/healthz/` | Health check (outside `/api/v1/`) | Anyone |

## 3. Examples

### Confirm a sale

```http
POST /api/v1/sales/
Idempotency-Key: 5f1c9c3e-1b0a-4a47-9d2a-2f5c8a0b6c11
Content-Type: application/json

{
  "lines": [
    { "product": 12, "quantity": 2 },
    { "product": 31, "quantity": 1 }
  ]
}
```

```json
{
  "id": 981,
  "number": "PUN01/2026-27/000123",
  "warehouse": { "id": 2, "code": "PUN01", "name": "Pune Warehouse" },
  "created_by": { "id": 7, "name": "Dev Patel" },
  "total": "3450.00",
  "lines": [
    { "product": 12, "name": "Steel Rack", "quantity": 2, "unit_price": "1200.00", "line_total": "2400.00" },
    { "product": 31, "name": "Padlock", "quantity": 1, "unit_price": "1050.00", "line_total": "1050.00" }
  ],
  "created_at": "2026-10-12T09:41:22Z"
}
```

Not enough stock returns `409` with `insufficient_stock` and nothing is saved.

### Adjust stock

```http
POST /api/v1/stock/adjust/
{ "product": 12, "counted_quantity": 18, "reason": "Damaged in storage" }
```

```json
{ "stock_level": 55, "previous_quantity": 20, "quantity": 18, "movement": { "id": 4021, "quantity_change": -2, "balance_after": 18 } }
```

### Receive a transfer

```http
POST /api/v1/transfers/45/receive/
{ "lines": [ { "product": 12, "quantity_received": 8 } ] }
```

The response includes `status: "received"` and, per line, `quantity_sent: 10`, `quantity_received: 8`, `variance: 2`.

## 4. Rate limits

| Scope | Limit |
| --- | --- |
| `POST /auth/login/` | 5 per minute per IP |
| Write endpoints | 60 per minute per user |
| Other authenticated requests | 300 per minute per user |

Limits are configurable. A limited request returns `429` with `Retry-After`.

## 5. Later releases

v1.1 adds `/customers/`, `/payments/`, `/returns/`, `/reports/<name>/`, `/suppliers/`, `/purchase-orders/` and `/settings/business/`, and extends sale creation with customer, discount, payment method and tax fields. v1.2 adds `/search/`, `/notifications/`, `/settings/notifications/`, product barcode lookup and image upload. Each addition is documented here when its milestone starts.
