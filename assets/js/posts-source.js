// assets/js/posts-source.js

function toSlug(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/['"’]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-") // 允许中文，其他变成 -
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function stripText(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickExcerpt(post, maxLen = 160) {
  const explicit = stripText(post?.excerpt || post?.summary || "");
  if (explicit) return explicit.slice(0, maxLen);

  const blocks = Array.isArray(post?.content_blocks) ? post.content_blocks : null;
  if (blocks && blocks.length) {
    for (const b of blocks) {
      const type = String(b?.type || "").toLowerCase();
      const t = stripText(b?.text || "");
      if (!t) continue;
      // 优先第一段正文
      if (type === "p" || type === "paragraph" || type === "" || !type) {
        return t.slice(0, maxLen);
      }
    }
    // 如果没有 p，就抓第一个有 text 的
    for (const b of blocks) {
      const t = stripText(b?.text || "");
      if (t) return t.slice(0, maxLen);
    }
  }

  const raw = stripText(post?.content || "");
  if (!raw) return "";
  return raw.slice(0, maxLen);
}

function parseMaybeDate(v) {
  if (!v) return null;

  // Notion date 可能是 { start: "2026-03-04", ... }
  if (typeof v === "object" && v.start) v = v.start;

  const s = String(v).trim();
  if (!s) return null;

  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

// ✅ 发布规则：
// 1) status 必须是 Published（大小写不敏感）
// 2) publishAt（或同义字段）如果存在，必须 <= now；不存在则视为已发布
function isPublished(post) {
  const statusRaw =
    post?.status ?? post?.Status ?? post?.state ?? post?.State ?? post?.published;
  const status = String(statusRaw ?? "").trim().toLowerCase();

  // 兼容：published=true
  if (status === "true") return true;

  // 常规：Published
  if (status && status !== "published") return false;
  // 如果没 status 字段：为了不破坏你现有站点，先放行（等你 Notion 加字段后再严格）
  // 你想“从今天开始严格 Draft 不上线”，把下一行改成：return false;
  // return false;
  // 先采用“渐进式”：无 status => 当作 published
  // 但如果你已经准备好 Notion 字段，也可以改为严格模式。
  const statusOk = !status || status === "published";
  if (!statusOk) return false;

  const dt =
    parseMaybeDate(post?.publishAt) ||
    parseMaybeDate(post?.publish_at) ||
    parseMaybeDate(post?.PublishAt) ||
    parseMaybeDate(post?.date) ||
    parseMaybeDate(post?.Date);

  if (!dt) return true; // 没写时间：立即发布
  return dt.getTime() <= Date.now();
}

function normalizePost(post) {
  const title = String(post?.title || post?.Title || "Untitled").trim();

  const rawSlug = String(post?.slug || post?.Slug || "").trim();
  const rawId = String(post?.id || post?.Id || "").trim();

  const cover = String(post?.cover || post?.Cover || "").trim();

  const dateVal =
    post?.date ||
    post?.Date ||
    post?.publishAt ||
    post?.publish_at ||
    post?.PublishAt ||
    "";

  // 输出统一字段
  return {
    ...post,
    title,
    id: rawId,
    slug: rawSlug, // 先不生成，后面统一生成唯一 slug
    cover,
    date: String(dateVal || "").trim(),
    excerpt: pickExcerpt(post, 160),
  };
}

function ensureUniqueSlugs(posts) {
  const used = new Map();

  for (const p of posts) {
    let base =
      String(p.slug || "").trim() ||
      toSlug(p.title) ||
      String(p.id || "").trim() ||
      "post";

    base = toSlug(base) || base; // 再走一遍清洗
    if (!base) base = "post";

    let slug = base;
    let n = used.get(base) || 0;

    // 如已占用，追加 -2 -3 ...
    while (used.has(slug)) {
      n += 1;
      slug = `${base}-${n + 1}`;
    }

    used.set(base, n);
    used.set(slug, 0);
    p.slug = slug;
  }

  return posts;
}

function sortByDateDesc(posts) {
  return posts.sort((a, b) => {
    const da =
      parseMaybeDate(a?.publishAt) ||
      parseMaybeDate(a?.publish_at) ||
      parseMaybeDate(a?.date) ||
      null;
    const db =
      parseMaybeDate(b?.publishAt) ||
      parseMaybeDate(b?.publish_at) ||
      parseMaybeDate(b?.date) ||
      null;

    const ta = da ? da.getTime() : 0;
    const tb = db ? db.getTime() : 0;
    return tb - ta;
  });
}

async function fetchArrayFromApi() {
  const r = await fetch("/api/posts", { cache: "no-store" });
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  const arr = Array.isArray(data) ? data : Array.isArray(data?.posts) ? data.posts : null;
  return arr;
}

async function fetchArrayFromStatic() {
  const r2 = await fetch("/assets/data/posts.json", { cache: "no-store" });
  if (!r2.ok) return [];
  const data2 = await r2.json().catch(() => null);
  return Array.isArray(data2) ? data2 : Array.isArray(data2?.posts) ? data2.posts : [];
}

// ✅ 对外：统一输出“发布流 posts”
export async function fetchPostsUnified() {
  let raw = null;

  // 1) CMS / API source
  try {
    raw = await fetchArrayFromApi();
  } catch {
    raw = null;
  }

  // 2) fallback: old static source
  if (!raw || !raw.length) {
    raw = await fetchArrayFromStatic();
  }

  const normalized = (raw || [])
    .map(normalizePost)
    .filter((p) => isPublished(p)); // ✅ 发布流过滤

  ensureUniqueSlugs(normalized);
  sortByDateDesc(normalized);

  return normalized;
}
