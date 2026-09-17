import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(`${root}/${relative}`, "utf8");

function migratedDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(read("test/fixtures/legacy.sql"));
  db.exec(read("migrations/non-production/0001_slug_lifecycle_shadow.sql"));
  db.exec(read("migrations/non-production/0002_seed_from_legacy.sql"));
  return db;
}

test("legacy rows seed one owner and one active claim each", () => {
  const db = migratedDatabase();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM website_slug_owners").get().n, 3);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM website_slug_claims").get().n, 3);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM website_slug_claims WHERE state='active' AND is_current=1").get().n,
    3
  );
  db.close();
});

test("reserved slug namespace rejects another owner", () => {
  const db = migratedDatabase();
  assert.throws(() => {
    db.prepare(`
      INSERT INTO website_slug_claims
        (owner_id, slug, state, is_current, namespace_reserved, protected_history)
      VALUES ('notion:page-b', 'slug-a', 'active', 1, 1, 0)
    `).run();
  }, /UNIQUE/);
  db.close();
});

test("one owner cannot have two current claims", () => {
  const db = migratedDatabase();
  assert.throws(() => {
    db.prepare(`
      INSERT INTO website_slug_claims
        (owner_id, slug, state, is_current, namespace_reserved, protected_history)
      VALUES ('notion:page-a', 'slug-a-2', 'active', 1, 1, 0)
    `).run();
  }, /UNIQUE/);
  db.close();
});

test("released draft slug can be reused while redirect history cannot", () => {
  const db = migratedDatabase();
  const claimA = db.prepare("SELECT claim_id FROM website_slug_claims WHERE slug='slug-a'").get().claim_id;
  db.prepare(`
    UPDATE website_slug_claims
    SET state='released', is_current=0, namespace_reserved=0, protected_history=0
    WHERE claim_id=?
  `).run(claimA);
  db.prepare(`
    INSERT INTO website_slug_owners (owner_id, notion_page_id, title)
    VALUES ('notion:page-d', 'page-d', 'D')
  `).run();
  db.prepare(`
    INSERT INTO website_slug_claims
      (owner_id, slug, state, is_current, namespace_reserved, protected_history)
    VALUES ('notion:page-d', 'slug-a', 'active', 1, 1, 0)
  `).run();

  const claimC = db.prepare("SELECT claim_id FROM website_slug_claims WHERE slug='slug-c'").get().claim_id;
  db.prepare(`
    UPDATE website_slug_claims
    SET state='redirect', is_current=0, namespace_reserved=1,
        protected_history=1, canonical_claim_id=?
    WHERE claim_id=?
  `).run(claimC, db.prepare("SELECT claim_id FROM website_slug_claims WHERE slug='slug-b'").get().claim_id);
  assert.throws(() => {
    db.prepare(`
      INSERT INTO website_slug_claims
        (owner_id, slug, state, is_current, namespace_reserved, protected_history)
      VALUES ('notion:page-a', 'slug-b', 'active', 1, 1, 0)
    `).run();
  }, /UNIQUE/);
  db.close();
});

test("invalid state combinations are rejected", () => {
  const db = migratedDatabase();
  assert.throws(() => {
    db.prepare(`
      INSERT INTO website_slug_claims
        (owner_id, slug, state, is_current, namespace_reserved, protected_history)
      VALUES ('notion:page-a', 'bad-state', 'released', 1, 0, 0)
    `).run();
  }, /CHECK/);
  db.close();
});
