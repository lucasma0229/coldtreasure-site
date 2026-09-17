-- NON-PRODUCTION ONLY during Phase P0.
-- Requires the legacy slug_registry table and 0001_slug_lifecycle_shadow.sql.

INSERT INTO website_slug_owners (
  owner_id,
  notion_page_id,
  title,
  created_at,
  updated_at
)
SELECT
  'notion:' || notion_page_id,
  notion_page_id,
  title,
  COALESCE(created_at, CURRENT_TIMESTAMP),
  COALESCE(updated_at, CURRENT_TIMESTAMP)
FROM slug_registry;

INSERT INTO website_slug_claims (
  owner_id,
  slug,
  state,
  is_current,
  namespace_reserved,
  protected_history,
  first_claimed_at,
  state_changed_at,
  created_at,
  updated_at
)
SELECT
  'notion:' || notion_page_id,
  slug,
  'active',
  1,
  1,
  0,
  COALESCE(created_at, CURRENT_TIMESTAMP),
  COALESCE(updated_at, CURRENT_TIMESTAMP),
  COALESCE(created_at, CURRENT_TIMESTAMP),
  COALESCE(updated_at, CURRENT_TIMESTAMP)
FROM slug_registry;

