CREATE TABLE slug_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notion_page_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_slug_registry_notion_page_id_unique
  ON slug_registry(notion_page_id);

INSERT INTO slug_registry (notion_page_id, slug, title, status) VALUES
  ('page-a', 'slug-a', 'A', 'active'),
  ('page-b', 'slug-b', 'B', 'active'),
  ('page-c', 'slug-c', 'C', 'active');

