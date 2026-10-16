# InvLab

[![CI](https://github.com/Rudradev02/InvLab/actions/workflows/ci.yml/badge.svg)](https://github.com/Rudradev02/InvLab/actions/workflows/ci.yml)

Multi-warehouse inventory and sales management for small and mid-size businesses. Each warehouse keeps its own stock, every stock change is recorded in a ledger, and access is split between three roles: Admin, Warehouse Manager and Staff.

**Status:** planning. This repository starts with documentation; code is built milestone by milestone (see [ROADMAP.md](ROADMAP.md)).

## What it does

- Tracks products and stock separately for each warehouse
- Records sales at the counter with correct, race-free stock deduction
- Generates GST-ready tax invoices with sequential numbering per warehouse/financial year, HSN summaries, and downloadable PDF format *(Note: InvLab provides invoice generation and formatting; it is not a certified tax filing or GSTR upload software)*
- Moves stock between warehouses with a dispatch and receive flow
- Gives the Admin one place to see every warehouse: manager, staff, address, stock and sales
- Keeps an immutable ledger of every stock movement, with who did it and why

## Roles

| Role | Works in | Can do |
| --- | --- | --- |
| Admin | All warehouses | Manage warehouses, users, products and categories; see everything; act in any warehouse |
| Warehouse Manager | Own warehouse | Manage stock, staff accounts, sales, returns and transfers for that warehouse; create and edit products |
| Staff | Own warehouse | Record sales; receive and adjust stock; view own sales |

The full permission matrix is in [FRD.md](FRD.md#4-permission-matrix).

## Documentation

| File | Purpose |
| --- | --- |
| [PRD.md](PRD.md) | Product requirements: vision, users, goals, scope, metrics |
| [FRD.md](FRD.md) | Functional requirements: every feature, rule and acceptance criterion |
| [TRD.md](TRD.md) | Technical requirements: stack, quality targets, standards |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design with diagrams and key decisions |
| [DATABASE.md](DATABASE.md) | Data model, constraints, indexes and invariants |
| [API.md](API.md) | REST API conventions and endpoint reference |
| [DESIGN.md](DESIGN.md) | Design system: tokens, components, layouts, motion, voice |
| [TESTING.md](TESTING.md) | Test strategy, tooling and quality gates |
| [SECURITY.md](SECURITY.md) | Threat model, controls and reporting |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Environments, configuration and release steps |
| [ROADMAP.md](ROADMAP.md) | Milestones with deliverables and exit criteria |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Workflow, conventions and pull request checklist |
| [AGENTS.md](AGENTS.md) | Rules for AI coding agents working in this repo |
| [CHANGELOG.md](CHANGELOG.md) | Release history |
| [.env.example](.env.example) | Environment variables |

Read in this order if you are new: PRD, FRD, ARCHITECTURE, then the rest as needed.

## Planned stack

Python 3.12, Django 5.2, Django REST Framework, PostgreSQL; React 19, TypeScript, Vite, Tailwind CSS, TanStack Query. Details and reasons are in [TRD.md](TRD.md).

## Quick start

### 1. Prerequisites
- Python 3.12+
- Node.js 20+ (with npm)
- Docker & Docker Compose (optional for containerized run)

### 2. Local Setup

```bash
# 1. Backend setup
python -m venv .venv
source .venv/bin/activate  # On Windows: .\.venv\Scripts\activate
pip install -r requirements-dev.txt

# 2. Database migrations and initial seed
python manage.py migrate
python manage.py seed_data

# 3. Start Django development server
python manage.py runserver 8000
```

In a second terminal:

```bash
# 4. Frontend setup
cd frontend
npm install
npm run dev  # Vite server runs on http://localhost:5173
```

### 3. Docker Compose (Alternative)

```bash
docker compose up --build
docker compose exec web python manage.py seed_data
```

### 4. Demo Logins
- **Admin**: `admin` / `Admin@123` (Full multi-warehouse access)
- **Manager**: `rahul.manager` / `Manager@123` (Pune Central Warehouse)
- **Staff**: `arun.staff` / `Staff@123` (Counter POS & Receiving)

## Automated Notifications & Daily Summary

InvLab features automated low-stock email alerts and a daily executive summary report without requiring external Celery/Redis daemons.

### Email Configuration

Email delivery settings are configured via environment variables in `.env`:

```env
# Optional SMTP configuration (defaults to Console backend in DEBUG mode)
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=apikey
EMAIL_HOST_PASSWORD=your_sendgrid_or_smtp_key
DEFAULT_FROM_EMAIL="InvLab Notifications <no-reply@invlab.local>"
```

### Scheduling the Daily Summary

The daily executive summary aggregates low-stock inventory, daily sales transactions, net revenue, and customer credit balances across warehouses. It is executed via Django's management command:

```bash
python manage.py send_daily_summary
```

To test without sending actual emails, use `--dry-run`:

```bash
python manage.py send_daily_summary --dry-run
```

#### Linux / macOS (cron)
Add an entry to crontab (`crontab -e`) to execute every evening at 19:00:

```cron
0 19 * * * cd /opt/invlab && /opt/invlab/.venv/bin/python manage.py send_daily_summary >> /var/log/invlab_summary.log 2>&1
```

#### Windows Task Scheduler
- **Action**: Start a program
- **Program**: `C:\path\to\invlab\.venv\Scripts\python.exe`
- **Arguments**: `manage.py send_daily_summary`
- **Start in**: `C:\path\to\invlab`
- **Trigger**: Daily at 7:00 PM

## Licence

To be decided before the first public release.
