-- Read-only production baseline captured 2026-09-17.
-- Database: coldtreasure-slug-registry
-- Database ID: fb6eee55-4ad6-468c-b156-17800d98fdbb

CREATE TABLE slug_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notion_page_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_slug_registry_notion_page_id
  ON slug_registry(notion_page_id);

CREATE UNIQUE INDEX idx_slug_registry_notion_page_id_unique
  ON slug_registry(notion_page_id);

CREATE INDEX idx_slug_registry_slug
  ON slug_registry(slug);

