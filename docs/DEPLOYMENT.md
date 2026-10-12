# Deployment

| | |
| --- | --- |
| Product | InvLab |
| Version | 0.1 (draft) |
| Date | 2026-10-12 |
| Related | [TRD.md](TRD.md), [SECURITY.md](SECURITY.md), [.env.example](.env.example) |

## 1. Environments

| Environment | How it runs | Database | Notes |
| --- | --- | --- | --- |
| Local, native | Django dev server and Vite dev server | SQLite or local PostgreSQL | Vite proxies `/api` to Django so everything is same-origin |
| Local, Docker | `docker compose up --build` | PostgreSQL container | Closest to production |
| CI | GitHub Actions | PostgreSQL service container | Tests and build |
| Production | Render web service | Neon PostgreSQL | One container serves the API and the built SPA |

The platform can be replaced (for example Railway); only the configuration file changes.

## 2. Configuration

All configuration is through environment variables. See [.env.example](.env.example) for the full list. The important ones:

| Variable | Purpose |
| --- | --- |
| `DJANGO_SECRET_KEY` | Random secret; required in production |
| `DJANGO_DEBUG` | `1` locally, `0` everywhere else |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated hostnames |
| `CSRF_TRUSTED_ORIGINS` | Full origins such as `https://invlab.onrender.com` |
| `DATABASE_URL` | PostgreSQL connection string (`sslmode=require` for Neon); SQLite is used if unset |
| `SECURE_SSL_REDIRECT`, `SECURE_HSTS_SECONDS` | Production transport security |
| `EMAIL_*` | SMTP settings (v1.2) |
| `LOG_LEVEL` | Logging verbosity |

Never commit real values. Set them in the platform's dashboard or secret store.

## 3. Build

One multi-stage Dockerfile:

1. **Node stage:** install frontend dependencies and run the production build.
2. **Python stage:** install backend dependencies, copy the backend and the built frontend, run `collectstatic`, create a non-root user.
3. **Start command:** run `gunicorn config.wsgi` with a sensible worker count for the instance size.

WhiteNoise serves the SPA and static files. Django returns the SPA's `index.html` for non-API routes so deep links work.

## 4. Local run

```
cp .env.example .env            # edit values
docker compose up --build       # app on http://localhost:8000
docker compose exec web python manage.py seed_data    # optional demo data
```

Without Docker: create a virtual environment, install requirements, run `python manage.py migrate`, start Django, then `npm install && npm run dev` in `frontend/`.

## 5. Production release (Render + Neon)

### First time

1. Create a Neon project and database; copy the pooled connection string.
2. Create a Render web service from the repository (Docker runtime).
3. Set the environment variables from section 2. Set the health check path to `/healthz/`.
4. Set the pre-deploy command to `python manage.py migrate --noinput`.
5. Deploy, open the URL, and confirm sign-in works over HTTPS.
6. Create the first Admin: `python manage.py createsuperuser` from the platform shell, then assign the Admin group (the project provides a command, `create_admin`, for this).
7. Optional demo: run `seed_data` only on a separate demo environment.

### Every release

1. Merge to `main` after CI passes.
2. The platform builds the image, runs migrations, then switches traffic.
3. Check `/healthz/`, sign in, and run a smoke test: create and confirm a sale in a test warehouse.
4. Watch logs for errors for 15 minutes.

### Rollback

- Redeploy the previous image from the platform's deploy history.
- Migrations are additive, so the previous code works with the newer schema. If a migration must be undone, restore from point-in-time recovery to a new database and switch `DATABASE_URL`.

## 6. Operations

| Area | Practice |
| --- | --- |
| Health | `/healthz/` returns 200 and checks the database connection; no sensitive data |
| Logs | JSON to stdout; read in the platform's log viewer |
| Backups | Neon point-in-time recovery; rehearse a restore before launch and every quarter |
| Integrity | Run `python manage.py check_stock_integrity` weekly and after any manual database work |
| Secrets | Rotate `DJANGO_SECRET_KEY` and database credentials yearly or after exposure (rotating the secret key signs everyone out) |
| Updates | Monthly dependency updates through pull requests; apply security fixes immediately |
| Scheduled jobs (v1.2) | `send_daily_summary` through the platform's cron feature |

## 7. Free-tier notes

- The web service may sleep when idle; the first request can take up to a minute. Mention this in the README next to the live link.
- Neon free databases also suspend when idle and resume on connection; the first query can be slow.
- Use the pooled connection string and keep connections short-lived.

## 8. Production checklist

- [ ] `DJANGO_DEBUG=0`, random `DJANGO_SECRET_KEY`
- [ ] Allowed hosts and CSRF trusted origins match the live URL
- [ ] `check --deploy` passes
- [ ] HTTPS only, secure cookies, HSTS
- [ ] Migrations applied, first Admin created
- [ ] Health check green
- [ ] Backup and restore rehearsed
- [ ] Demo data not present in the real database
- [ ] README has the live link and cold-start note
