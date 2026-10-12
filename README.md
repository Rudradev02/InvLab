# InvLab

Multi-warehouse inventory and sales management for small and mid-size businesses. Each warehouse keeps its own stock, every stock change is recorded in a ledger, and access is split between three roles: Admin, Warehouse Manager and Staff.

**Status:** planning. This repository starts with documentation; code is built milestone by milestone (see [ROADMAP.md](ROADMAP.md)).

## What it does

- Tracks products and stock separately for each warehouse
- Records sales at the counter with correct, race-free stock deduction
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

Filled in during milestone M0, once the project scaffold exists.

## Licence

To be decided before the first public release.
