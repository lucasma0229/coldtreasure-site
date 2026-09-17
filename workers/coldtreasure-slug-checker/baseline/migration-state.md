# Migration baseline

As observed on 2026-09-17:

- D1 exposes one application table: `slug_registry`.
- No D1 migration ledger/table was visible.
- No repository migration files existed for this Worker before Phase P0.
- Production has 32 rows: 32 distinct owners, 32 distinct slugs, all `active`, no blank owner/slug.
- No history, redirect, transition, lease, automation run, attempt, or snapshot tables exist.

Phase P0 adds only non-production migration preparation. No migration in this repository has been applied to production.

