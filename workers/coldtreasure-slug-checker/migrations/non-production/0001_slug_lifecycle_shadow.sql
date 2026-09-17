-- NON-PRODUCTION ONLY during Phase P0.
-- This migration prepares a shadow Website-channel slug lifecycle model.
-- It must not be run against production without later explicit authorization.

PRAGMA foreign_keys = ON;

CREATE TABLE website_slug_owners (
  owner_id TEXT PRIMARY KEY,
  notion_page_id TEXT NOT NULL UNIQUE,
  title TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE website_slug_claims (
  claim_id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'redirect', 'retired', 'released')),
  is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
  namespace_reserved INTEGER NOT NULL DEFAULT 1 CHECK (namespace_reserved IN (0, 1)),
  protected_history INTEGER NOT NULL DEFAULT 0 CHECK (protected_history IN (0, 1)),
  canonical_claim_id INTEGER,
  first_claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  state_changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES website_slug_owners(owner_id),
  FOREIGN KEY (canonical_claim_id) REFERENCES website_slug_claims(claim_id),
  CHECK (
    (state = 'active' AND is_current = 1 AND namespace_reserved = 1 AND canonical_claim_id IS NULL)
    OR (state = 'redirect' AND is_current = 0 AND namespace_reserved = 1 AND protected_history = 1 AND canonical_claim_id IS NOT NULL)
    OR (state = 'retired' AND is_current = 0 AND namespace_reserved = 1 AND protected_history = 1 AND canonical_claim_id IS NULL)
    OR (state = 'released' AND is_current = 0 AND namespace_reserved = 0 AND protected_history = 0 AND canonical_claim_id IS NULL)
  )
);

CREATE UNIQUE INDEX ux_website_slug_claims_reserved_slug
  ON website_slug_claims(slug)
  WHERE namespace_reserved = 1;

CREATE UNIQUE INDEX ux_website_slug_claims_current_owner
  ON website_slug_claims(owner_id)
  WHERE is_current = 1;

CREATE INDEX ix_website_slug_claims_owner
  ON website_slug_claims(owner_id, state_changed_at);

CREATE TABLE website_slug_transitions (
  transition_id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  claim_id INTEGER NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL CHECK (to_state IN ('active', 'redirect', 'retired', 'released')),
  reason TEXT NOT NULL,
  run_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES website_slug_owners(owner_id),
  FOREIGN KEY (claim_id) REFERENCES website_slug_claims(claim_id)
);

CREATE INDEX ix_website_slug_transitions_owner_created
  ON website_slug_transitions(owner_id, created_at);

CREATE TABLE automation_runs (
  run_id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('scheduled', 'admin', 'machine')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'partial', 'failed', 'busy')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  summary_json TEXT
);

CREATE TABLE automation_attempts (
  attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  owner_ref TEXT,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  error_class TEXT CHECK (error_class IN ('deterministic', 'transient', 'exhausted')),
  next_retry_at TEXT,
  result TEXT,
  technical_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES automation_runs(run_id)
);

CREATE INDEX ix_automation_attempts_retry
  ON automation_attempts(next_retry_at)
  WHERE next_retry_at IS NOT NULL;

CREATE TABLE job_leases (
  resource_key TEXT PRIMARY KEY,
  owner_token TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL
);

