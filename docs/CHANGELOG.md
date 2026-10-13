# Changelog

All notable changes to InvLab are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **M0 Foundations & App Shell**:
  - Django backend architecture with modular domain apps (`core`, `accounts`, `warehouses`, `catalog`, `inventory`, `sales`, `transfers`, `audit`, `api`).
  - Session auth, warehouse scoping mixin, role permissions (`Admin`, `Warehouse Manager`, `Staff`).
  - Atomic, row-locked stock operations (`receive_stock`, `adjust_stock`, `create_sale`) with immutable ledger and check constraint `quantity >= 0`.
  - Database schema and migrations on SQLite & PostgreSQL.
  - Multi-warehouse seed command (`seed_data`) and integrity command (`check_stock_integrity`).
  - React 19 + TypeScript + Vite + Tailwind CSS frontend with signature stock indicator, app shell, POS billing, warehouses, and ledger.
  - Automated CI workflow with PostgreSQL service and test suite.
  - Multi-stage Dockerfile and docker-compose orchestration.

## [1.0.0] - not yet released

Target contents: authentication and roles, warehouses and users, catalogue, per-warehouse stock with ledger, sales and receipts, dashboards, Admin warehouses overview, stock transfers.
