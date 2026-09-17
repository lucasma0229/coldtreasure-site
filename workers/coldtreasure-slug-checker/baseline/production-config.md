# Production configuration baseline

Captured read-only on 2026-09-17.

| Item | Baseline |
|---|---|
| Worker | `coldtreasure-slug-checker` |
| Environment | `production` |
| Active version | `f2b53f35-9f64-4851-b1db-fa6e2c1e5fdd` |
| Traffic | 100% |
| Deployment | Manual Cloudflare Dashboard deployment |
| Compatibility date | `2026-09-15` |
| Cron | Every minute (`* * * * *`) |
| D1 binding | `SLUG_DB` → `coldtreasure-slug-registry` (`fb6eee55-4ad6-468c-b156-17800d98fdbb`) |
| Runtime variable | `NOTION_DATA_SOURCE_ID` configured |
| Secret | `NOTION_KEY` configured; value not captured |

This file is evidence, not a deployable configuration. Cloudflare Access, account settings, encrypted secret values, and platform-managed version state are not included.

