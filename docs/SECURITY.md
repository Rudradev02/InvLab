# Security

| | |
| --- | --- |
| Product | InvLab |
| Version | 0.1 (draft) |
| Date | 2026-10-12 |
| Related | [TRD.md](TRD.md), [ARCHITECTURE.md](ARCHITECTURE.md), [TESTING.md](TESTING.md) |

## 1. Scope

InvLab holds business data: stock, sales, staff accounts and contact details. It does not store payment card data. This document lists what must be protected, the main threats, and the controls that address them.

## 2. Assets

| Asset | Why it matters |
| --- | --- |
| User accounts and sessions | Access to everything the role allows |
| Stock and sales records | Core business data; integrity matters most |
| Staff and contact details | Personal data of employees (and customers from v1.1) |
| Audit log | Evidence of who did what |
| Secrets (secret key, database URL, email credentials) | Full compromise if leaked |

## 3. Threats and controls

| Threat | Control |
| --- | --- |
| Guessing or stuffing passwords | Strong password policy; sign-in throttle (5 per minute per IP); generic error text; deactivation ends sessions |
| Session theft | HttpOnly, Secure, SameSite=Lax cookies; HTTPS only; HSTS; session expiry after inactivity; sessions deleted when a user is deactivated |
| Cross-site request forgery | Django CSRF protection on all writes; same-origin deployment |
| Cross-site scripting | React escapes output by default; no `dangerouslySetInnerHTML`; Content-Security-Policy; sanitised receipt content |
| Access beyond one's role | Explicit permission class on every endpoint; guard and matrix tests |
| Reading another warehouse's data | One scoping mixin; 404 for foreign records; scoping tests on every resource |
| Privilege escalation | Managers cannot create Managers or Admins or change roles; nobody changes their own role; last Admin protected |
| Tampering with stock history | Append-only ledger and audit log; no edit or delete endpoints; optional database permissions that block updates |
| Overselling through concurrent requests | Row locks, check constraint, idempotency keys, concurrency tests |
| Injection (SQL, formula, header) | Django ORM with parameters; spreadsheet export escapes cells starting with `=`, `+`, `-`, `@`; no raw SQL without review |
| Enumeration of ids | 404 instead of 403 for foreign records |
| Abuse of write endpoints | Per-user rate limits |
| Leaked secrets | Secrets only in environment variables; `.env` ignored; secret scanning in CI; rotate after any exposure |
| Vulnerable dependencies | Locked versions; automated scans in CI; updates through reviewed pull requests |
| Information leakage in errors and logs | `DEBUG` off in production; generic 500 pages with a request id; logs exclude passwords, cookies and request bodies |
| Clickjacking and content sniffing | `X-Frame-Options` or `frame-ancestors`, `X-Content-Type-Options: nosniff`, strict referrer policy |
| Malicious file uploads (v1.2 images) | Type, size and real-image checks; random file names; stored outside the app disk; never executed |

## 4. Authentication and passwords

- Django's password hashing (PBKDF2 by default, or Argon2 if added).
- Password policy: at least 10 characters, not entirely numeric, not common, not similar to the username.
- Users created by another user must change their password at first sign-in.
- Password reset by an Admin or Manager sets a temporary password and forces a change.
- Session lifetime: 12 hours absolute; inactivity timeout 2 hours (configurable).

## 5. Authorisation

- Roles are Django groups with permissions; checks are done in permission classes, not in views.
- Every queryset on a warehouse-owned model goes through the scoping mixin.
- The permission matrix in [FRD.md](FRD.md#4-permission-matrix) is the specification; [TESTING.md](TESTING.md#32-permission-matrix) describes the tests that enforce it.

## 6. Transport and browser protections (production)

| Setting | Value |
| --- | --- |
| HTTPS | Enforced; `SECURE_SSL_REDIRECT` on |
| HSTS | Enabled with a long max-age once HTTPS is confirmed, then preload considered |
| Cookies | `Secure`, `HttpOnly` (session), `SameSite=Lax` |
| CSP | `default-src 'self'`; scripts and styles from self; fonts from the font provider if used; start in report-only, then enforce |
| Other headers | `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy` with camera allowed only for the sale screen (v1.2), frame protection |
| CORS | Off (same origin) |

`python manage.py check --deploy` must pass with production settings.

## 7. Data protection

- Personal data kept to what is needed: name, username, email, phone, work address.
- Backups use the database provider's point-in-time recovery, which is encrypted at rest.
- Demo data and demo accounts are fictional and clearly labelled; demo passwords are public and never used with real data.
- A deactivated user's records remain for audit purposes. A deletion request for personal data is handled by anonymising the profile fields while keeping the records.

## 8. Audit logging

Recorded: sign-in failures (counts only), role and warehouse changes, user activation and deactivation, password resets, stock adjustments, transfer dispatch, receive and cancel, deletions. Each entry has actor, time, target and before and after values. Entries are append-only and visible to the Admin.

## 9. Secure development

- Pull requests need review and passing CI.
- No secrets, real data or `.env` files in the repository; a pre-commit or CI secret scan runs on every push.
- Dependencies are pinned; vulnerability scanning runs in CI and fails on high severity.
- New endpoints must declare permissions and appear in the permission matrix test.
- Security-relevant changes (auth, permissions, scoping, headers) are called out in the pull request description.

## 10. Incident response

1. Contain: deactivate affected accounts, rotate secrets, take the service offline if needed.
2. Assess: use the audit log, request ids and database point-in-time recovery to find what changed.
3. Recover: restore data if needed; verify with `check_stock_integrity`.
4. Learn: write a short post-incident note and add a test that would have caught it.

## 11. Reporting a vulnerability

Until a public release, contact the repository owner privately (GitHub profile Rudradev02) with steps to reproduce. Please do not open a public issue for security problems. A contact email will be added to this file before the first public release.

## 12. Security checklist before launch

- [ ] `DEBUG` is off; `SECRET_KEY` is random and set through the environment
- [ ] `check --deploy` passes
- [ ] HTTPS, HSTS, secure cookies and CSP enforced
- [ ] Throttles verified; sign-in returns 429 after the limit
- [ ] Permission matrix and scoping tests pass in CI
- [ ] Concurrency tests pass on PostgreSQL
- [ ] Demo accounts removed or isolated from real data
- [ ] Secret scan and dependency scan clean
- [ ] Backup restore rehearsed
