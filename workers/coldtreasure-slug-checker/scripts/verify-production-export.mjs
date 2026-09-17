import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const path = process.argv[2];
if (!path) throw new Error("Usage: node scripts/verify-production-export.mjs <csv-path>");

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(`${root}/${relative}`, "utf8");

const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
const lines = text.trimEnd().split(/\r?\n/);
assert.equal(lines.length, 33, "expected one header and 32 data rows");

const header = lines[0];
assert.match(header, /id/);
assert.match(header, /notion_page_id/);
assert.match(header, /slug/);
assert.match(header, /status/);

const ids = new Set();
const owners = new Set();
const slugs = new Set();
let active = 0;
const records = [];

// The Dashboard CSV quotes fields containing commas, newlines, or quotes.
// These production titles contain no commas in this baseline, so a small
// quote-aware parser is sufficient and fails closed on malformed rows.
function parseCsv(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  assert.equal(quoted, false, "unclosed CSV quote");
  cells.push(value);
  return cells;
}

for (const line of lines.slice(1)) {
  const [id, owner, slug, title, status, createdAt, updatedAt] = parseCsv(line);
  assert.ok(id && owner && slug, "id, owner, and slug are required");
  ids.add(id);
  owners.add(owner);
  slugs.add(slug);
  if (status === "active") active++;
  records.push({ id, owner, slug, title, status, createdAt, updatedAt });
}

assert.equal(ids.size, 32);
assert.equal(owners.size, 32);
assert.equal(slugs.size, 32);
assert.equal(active, 32);

const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON;");
db.exec(read("baseline/production-schema.sql"));
const insert = db.prepare(`
  INSERT INTO slug_registry
    (id, notion_page_id, slug, title, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
for (const record of records) {
  insert.run(
    Number(record.id),
    record.owner,
    record.slug,
    record.title,
    record.status,
    record.createdAt || null,
    record.updatedAt || null
  );
}

db.exec(read("migrations/non-production/0001_slug_lifecycle_shadow.sql"));
db.exec(read("migrations/non-production/0002_seed_from_legacy.sql"));

assert.equal(db.prepare("SELECT COUNT(*) AS n FROM website_slug_owners").get().n, 32);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM website_slug_claims").get().n, 32);
assert.equal(
  db.prepare("SELECT COUNT(*) AS n FROM website_slug_claims WHERE state='active' AND is_current=1 AND namespace_reserved=1").get().n,
  32
);
assert.equal(
  db.prepare("SELECT COUNT(DISTINCT owner_id) AS n FROM website_slug_claims").get().n,
  32
);
assert.equal(
  db.prepare("SELECT COUNT(DISTINCT slug) AS n FROM website_slug_claims").get().n,
  32
);
db.close();

console.log(JSON.stringify({
  rows: 32,
  distinctOwners: 32,
  distinctSlugs: 32,
  active: 32,
  nonProductionMigration: "PASS"
}));
