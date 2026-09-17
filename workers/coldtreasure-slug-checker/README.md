# ColdTreasure Website Slug Checker

This module is the slug lifecycle manager for the `coldtreasure.com` **Website Publishing Channel**.

Website slugs are channel identities, not ColdTreasure's cross-platform content identity. Stable internal content IDs remain authoritative across publishing channels. Future channels may define their own platform IDs, permalinks, publication states, and synchronization logic without reusing Website slugs.

## Phase P0 status

- `src/worker.js` is the read-only captured production source for deployed version `f2b53f35-9f64-4851-b1db-fa6e2c1e5fdd`.
- `baseline/` records the production configuration shape and D1 schema without secrets.
- `migrations/non-production/` contains proposed shadow-schema migrations for isolated testing only.
- `test/` validates the proposed migration and lifecycle constraints using an in-memory SQLite database.
- Nothing in this directory has been deployed by Phase P0.

Do not deploy the captured source as a remediation. It intentionally preserves the production behavior observed during Preflight, including the known unauthenticated `/run` endpoint. Remediation implementation belongs to later authorized phases.

## Local verification

With Node.js 24 or later:

```text
node --test test/*.test.mjs
node scripts/verify-production-export.mjs <path-to-slug-registry.csv>
```

No Cloudflare credentials are required for these local checks.

