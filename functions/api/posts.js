// functions/api/posts.js
export async function onRequest(context) {
  const NOTION_KEY = context.env.NOTION_KEY;
  const DATABASE_ID = context.env.NOTION_DATABASE_ID;

  const url = new URL(context.request.url);
  const all = url.searchParams.get("all") === "1";
  const debug = url.searchParams.get("debug") === "1";

  const version = "posts-api-cms-flow-author-excerpt-publishAt-2026-03-06-02";
  const STATIC_PATH = "/assets/data/posts.json";

  let staticDebug = null;

  const normStr = (v) => String(v ?? "").trim();
  const dateKey = (d) => (normStr(d) ? normStr(d) : "0000-00-00");

  // -------- slug / excerpt helpers --------
  const toSlug = (input) => {
    const s = normStr(input);
    if (!s) return "";
    return s
      .toLowerCase()
      .replace(/['"’‘“”]/g, "")
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const normalizeShoeNameSeed = (name) => {
    const s = normStr(name);
    if (!s) return "";
    return s
      .replace(/\s*[x×]\s*/gi, " ")
      .replace(/['"’‘“”]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const stripText = (s) => normStr(s).replace(/\s+/g, " ").trim();

  function pickExcerpt(p, maxLen = 160) {
    const explicit = stripText(p?.excerpt || p?.summary || "");
    if (explicit) return explicit.slice(0, maxLen);

    const blocks = Array.isArray(p?.content_blocks) ? p.content_blocks : null;
    if (blocks && blocks.length) {
      for (const b of blocks) {
        const type = String(b?.type || "").toLowerCase();
        const t = stripText(b?.text || "");
        if (!t) continue;
        if (type === "p" || type === "paragraph" || type === "" || !type) {
          return t.slice(0, maxLen);
        }
      }
      for (const b of blocks) {
        const t = stripText(b?.text || "");
        if (t) return t.slice(0, maxLen);
      }
    }

    const raw = stripText(p?.content || "");
    if (!raw) return "";
    return raw.slice(0, maxLen);
  }

  function parseMaybeDate(v) {
    if (!v) return null;
    if (typeof v === "object" && v.start) v = v.start;
    const s = normStr(v);
    if (!s) return null;
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  // ---------- Notion safe readers ----------
  const safeText = (prop) => {
    if (!prop) return "";
    if (prop.type === "title") return prop.title?.map((t) => t.plain_text).join("") ?? "";
    if (prop.type === "rich_text") return prop.rich_text?.map((t) => t.plain_text).join("") ?? "";
    if (prop.type === "select") return prop.select?.name ?? "";
    if (prop.type === "multi_select") {
      return prop.multi_select?.map((x) => x?.name).filter(Boolean).join(", ") ?? "";
    }
    if (prop.type === "number") return prop.number != null ? String(prop.number) : "";
    if (prop.type === "url") return prop.url ?? "";
    if (prop.type === "formula") {
      return (
        prop.formula?.string ??
        (prop.formula?.number != null ? String(prop.formula.number) : "") ??
        (prop.formula?.boolean != null ? String(prop.formula.boolean) : "") ??
        ""
      );
    }
    if (prop.type === "checkbox") return String(!!prop.checkbox);
    return "";
  };

  const safeStatusName = (prop) => {
    if (!prop) return "";
    if (prop.type === "status") return prop.status?.name ?? "";
    return safeText(prop);
  };

  const safeDateStart = (prop) => prop?.date?.start ?? "";
  const safeUrl = (prop) => {
    if (!prop) return "";
    if (prop.type === "url") return normStr(prop.url);
    return "";
  };

  const safeFilesOrUrl = (prop) => {
    if (!prop) return "";

    // 新结构：URL
    if (prop.type === "url") return normStr(prop.url);

    // 旧结构：Files
    const f = prop?.files?.[0];
    if (!f) return "";
    return normStr(f.file?.url ?? f.external?.url ?? "");
  };

  const safeGallery = (prop) => {
    if (!prop) return [];

    // 方案 A：旧的 files 类型
    if (prop.type === "files") {
      const files = prop.files || [];
      return files
        .map((f) => normStr(f?.file?.url ?? f?.external?.url ?? ""))
        .filter(Boolean);
    }

    // 方案 B：新的 rich_text / 文本，一行一个 URL
    if (prop.type === "rich_text") {
      const raw = (prop.rich_text || []).map((t) => t.plain_text || "").join("");
      return raw
        .split(/\r?\n/)
        .map((s) => normStr(s))
        .filter(Boolean);
    }

    // 方案 C：如果误用了 url，也兼容成单图数组
    if (prop.type === "url") {
      const one = normStr(prop.url);
      return one ? [one] : [];
    }

  const safeMultiSelect = (prop) => {
    const arr = prop?.multi_select || [];
    return arr.map((x) => x?.name).filter(Boolean);
  };

  const safePublishBool = (prop) => {
    if (!prop) return true;
    if (prop.type === "checkbox") return !!prop.checkbox;
    if (prop.type === "formula" && prop.formula?.boolean != null) return !!prop.formula.boolean;

    const text = (safeText(prop) || "").trim().toLowerCase();
    if (!text) return true;

    if (["false", "0", "no", "n", "off", "下线", "否"].includes(text)) return false;
    if (["true", "1", "yes", "y", "on", "上线", "是"].includes(text)) return true;

    return true;
  };

  const pickNotionProp = (props, candidates = []) => {
    for (const key of candidates) {
      if (props && props[key]) return props[key];
    }
    return null;
  };

  // ---------- Notion pagination ----------
  async function queryNotionAllPages() {
    if (!NOTION_KEY || !DATABASE_ID) {
      return {
        ok: true,
        results: [],
        meta: { pages: 0, has_more: false, skipped: true },
      };
    }

    const tryQuery = async (sorts) => {
      let start_cursor = undefined;
      const out = [];
      let has_more = false;
      let pages = 0;

      do {
        const body = {
          page_size: 100,
          ...(sorts ? { sorts } : {}),
          ...(start_cursor ? { start_cursor } : {}),
        };

        const res = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${NOTION_KEY}`,
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28",
          },
          body: JSON.stringify(body),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) return { ok: false, status: res.status || 500, detail: data };

        out.push(...(data?.results || []));
        has_more = !!data?.has_more;
        start_cursor = data?.next_cursor || undefined;
        pages += 1;

        if (pages > 20) break;
      } while (has_more);

      return { ok: true, results: out, meta: { pages, has_more } };
    };

    const sortCandidates = [
      [{ property: "PublishAt", direction: "descending" }],
      [{ property: "publishAt", direction: "descending" }],
      [{ property: "发布时间", direction: "descending" }],
      [{ property: "发布于", direction: "descending" }],
      [{ property: "上线时间", direction: "descending" }],
      [{ property: "date", direction: "descending" }],
      [{ property: "日期", direction: "descending" }],
      [{ property: "Date", direction: "descending" }],
      [{ timestamp: "created_time", direction: "descending" }],
    ];

    let lastError = null;
    for (const sorts of sortCandidates) {
      const r = await tryQuery(sorts);
      if (r.ok) return r;
      lastError = r.detail || r.error || r;
    }

    return {
      ok: false,
      status: 500,
      error: { error: "Notion API error", detail: lastError },
    };
  }

  // ---------- Load static posts.json ----------
  async function loadStaticPosts() {
    const origin = url.origin;
    const absoluteUrl = `${origin}${STATIC_PATH}?v=${Date.now()}`;

    const parseJsonArray = async (res, channel) => {
      const ct = res.headers.get("content-type") || "";
      const text = await res.text();

      if (!staticDebug) {
        staticDebug = {
          channel,
          requested: channel === "ASSETS" ? STATIC_PATH : absoluteUrl,
          status: res.status,
          ok: res.ok,
          contentType: ct,
          head: text.slice(0, 160),
          hasASSETS: !!context.env.ASSETS,
        };
      }

      if (!res.ok) return [];
      const trimmed = text.trim();
      if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return [];

      const data = JSON.parse(trimmed);
      const arr = Array.isArray(data) ? data : Array.isArray(data?.posts) ? data.posts : [];
      return Array.isArray(arr) ? arr : [];
    };

    try {
      if (context.env.ASSETS?.fetch) {
        const reqUrl = new URL(STATIC_PATH, "https://assets.local");
        const res = await context.env.ASSETS.fetch(new Request(reqUrl.toString()));
        const arr = await parseJsonArray(res, "ASSETS");
        if (arr.length) return arr;
      }
    } catch (e) {
      if (!staticDebug) staticDebug = { channel: "ASSETS", error: String(e?.message || e) };
    }

    try {
      const res = await fetch(absoluteUrl, { cache: "no-store" });
      return await parseJsonArray(res, "ORIGIN_FETCH");
    } catch (e) {
      if (!staticDebug) staticDebug = { channel: "ORIGIN_FETCH", error: String(e?.message || e) };
      return [];
    }
  }

  function blocksToText(blocks) {
    if (!Array.isArray(blocks)) return "";
    return blocks
      .map((b) => {
        if (!b) return "";
        if (typeof b === "string") return b;
        if (Array.isArray(b?.items)) return b.items.join(" ");
        return b.text || "";
      })
      .filter(Boolean)
      .join("\n");
  }

  function normalizeRelease(releaseRaw, title) {
    const raw = normStr(releaseRaw);
    if (!raw) return { release_info: "", release_lines: [] };

    const t = normStr(title);
    const lines = raw
      .split(/\r?\n/)
      .map((s) => normStr(s))
      .filter(Boolean);

    const filtered = [];
    for (const line of lines) {
      const low = line.toLowerCase();
      if (line === "发售信息" || low === "release info" || low === "release information") continue;

      if (line.startsWith("鞋款：") && t) {
        const val = normStr(line.replace(/^鞋款：/, ""));
        if (val === t || val.includes(t)) continue;
      }
      filtered.push(line);
    }

    return { release_info: filtered.join("\n"), release_lines: filtered };
  }

  function normalizePost(p, source) {
    if (!p) return null;

    const rawId = normStr(p.id);
    const rawSlug = normStr(p.slug);
    const rawTitle = normStr(p.title);
    if (!rawId && !rawSlug && !rawTitle) return null;

    const rawAuthor = normStr(p.author);

    const brandRaw = Array.isArray(p.brand)
      ? p.brand.map((x) => normStr(x)).filter(Boolean).join(", ")
      : normStr(p.brand);

    const brand = brandRaw.replace(/\s*\n+\s*/g, ", ").replace(/\s*,\s*/g, ", ").trim();

    const cover = normStr(p.cover || p.hero || p.image || p.thumb);

    const contentIsBlocks = Array.isArray(p.content);
    const content_blocks = contentIsBlocks ? p.content : [];
    const content_text =
      typeof p.content === "string"
        ? p.content
        : contentIsBlocks
          ? blocksToText(p.content)
          : p.content
            ? JSON.stringify(p.content)
            : "";

    const rel = normalizeRelease(p.release_info, rawTitle);

    const shoeSeed = normalizeShoeNameSeed(p.shoeName);
    let slug = rawSlug || toSlug(shoeSeed) || toSlug(rawTitle) || rawId;

    if (!rawSlug) slug = toSlug(slug).slice(0, 60).replace(/-$/, "");

    const publishAt = normStr(p.publishAt || p.publish_at || p.date);
    const status = normStr(p.status || p.Status);

    return {
      id: rawId || slug || rawTitle,
      slug,
      title: rawTitle,

      shoeName: normStr(p.shoeName),
      author: rawAuthor,

      date: normStr(p.date),
      publishAt,
      status,

      brand,
      cover,

      summary: normStr(p.summary),
      excerpt: normStr(p.excerpt) || pickExcerpt({ ...p, content: content_text, content_blocks }, 160),

      release_info: rel.release_info,
      release_lines: rel.release_lines,

      keywords: Array.isArray(p.keywords) ? p.keywords : Array.isArray(p.tags) ? p.tags : [],
      gallery: Array.isArray(p.gallery) ? p.gallery : [],

      publish: typeof p.publish === "boolean" ? p.publish : true,

      content: content_text,
      content_blocks,
      source,
    };
  }

  function isPublishedFlow(p, hasStatusField) {
    if (!p) return false;

    if (hasStatusField) {
      const st = normStr(p.status).toLowerCase();
      if (st !== "published") return false;
    } else {
      if (p.publish !== true) return false;
    }

    const dt = parseMaybeDate(p.publishAt) || parseMaybeDate(p.date);
    if (!dt) return true;
    return dt.getTime() <= Date.now();
  }

  function ensureUniqueSlugs(posts) {
    const used = new Set();

    for (const p of posts) {
      const base = toSlug(p.slug) || toSlug(p.title) || toSlug(p.id) || "post";
      let slug = base;
      let i = 2;

      while (used.has(slug)) {
        slug = `${base}-${i++}`;
      }

      p.slug = slug;
      used.add(slug);
    }

    return posts;
  }

  try {
    const nq = await queryNotionAllPages();
    if (!nq.ok) {
      return new Response(
        JSON.stringify(nq.error || nq.detail || { error: "Notion query failed" }, null, 2),
        {
          status: nq.status || 500,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }

    const notionResults = nq.results || [];
    const samplePropertyNames = notionResults?.[0]?.properties
      ? Object.keys(notionResults[0].properties)
      : [];

    const CAND = {
      title: ["title", "标题", "Title"],
      slug: ["slug", "Slug", "短链", "文章ID", "id"],

      shoeName: ["ShoeName", "shoeName", "鞋款名", "鞋款名称", "Model"],
      author: ["Author", "author", "作者", "Byline"],

      status: ["Status", "status", "状态", "发布状态"],
      publishAt: ["PublishAt", "publishAt", "发布时间", "发布于", "上线时间", "date", "日期", "Date"],

      brand: ["brand", "品牌", "Brand"],

      // 旧摘要字段
      summary: ["首页摘要", "summary", "home_summary"],

      // 新正式摘要字段
      excerpt: ["excerpt", "Excerpt"],

      content: ["content", "正文", "Content", "文章内容"],
      date: ["date", "日期", "Date"],

      cover: ["cover", "封面", "首图", "hero", "thumb", "thumbnail"],
      gallery: ["gallery", "图集", "相册", "images", "Gallery"],
      keywords: ["keywords", "关键词", "tags", "标签", "Topics"],

      publish: ["publish", "published", "发布", "上线", "公开", "Publish"],
      release: ["release_info", "发售信息", "Release", "release", "Release Info"],
    };

    const hasStatusField =
      samplePropertyNames.includes("Status") ||
      samplePropertyNames.includes("status") ||
      samplePropertyNames.includes("状态") ||
      samplePropertyNames.includes("发布状态");

    let notionPosts = notionResults
      .map((row) => {
        const props = row.properties || {};

        const titleProp = pickNotionProp(props, CAND.title);
        const slugProp = pickNotionProp(props, CAND.slug);
        const shoeNameProp = pickNotionProp(props, CAND.shoeName);
        const authorProp = pickNotionProp(props, CAND.author);

        const brandProp = pickNotionProp(props, CAND.brand);
        const summaryProp = pickNotionProp(props, CAND.summary);
        const excerptProp = pickNotionProp(props, CAND.excerpt);
        const contentProp = pickNotionProp(props, CAND.content);

        const dateProp = pickNotionProp(props, CAND.date);
        const publishAtProp = pickNotionProp(props, CAND.publishAt);
        const statusProp = pickNotionProp(props, CAND.status);

        const coverProp = pickNotionProp(props, CAND.cover);
        const galleryProp = pickNotionProp(props, CAND.gallery);
        const keywordsProp = pickNotionProp(props, CAND.keywords);
        const publishProp = pickNotionProp(props, CAND.publish);
        const releaseProp = pickNotionProp(props, CAND.release);

        return normalizePost(
          {
            id: row.id,
            title: safeText(titleProp),
            slug: safeText(slugProp),

            shoeName: safeText(shoeNameProp),
            author: safeText(authorProp),

            status: safeStatusName(statusProp),
            publishAt: safeDateStart(publishAtProp) || safeDateStart(dateProp),

            brand: safeText(brandProp),

            // 旧字段仍保留输出
            summary: safeText(summaryProp),

            // 新字段优先；没有时再回退旧字段
            excerpt: safeText(excerptProp) || safeText(summaryProp),

            date: safeDateStart(dateProp),

            cover: safeFilesOrUrl(coverProp),
            cover: safeFilesOrUrl(coverProp),
            
            gallery: safeGallery(galleryProp),
            keywords: safeMultiSelect(keywordsProp),

            publish: safePublishBool(publishProp),
            release_info: safeText(releaseProp),
          },
          "notion"
        );
      })
      .filter(Boolean);

    if (!all) {
      notionPosts = notionPosts.filter((p) => isPublishedFlow(p, hasStatusField));
    }

    const staticRaw = await loadStaticPosts();
    let staticPosts = staticRaw.map((p) => normalizePost(p, "static")).filter(Boolean);

    if (!all) {
      staticPosts = staticPosts.filter((p) => isPublishedFlow(p, false));
    }

    const map = new Map();
    for (const p of staticPosts) map.set(String(p.slug || p.id), p);
    for (const p of notionPosts) map.set(String(p.slug || p.id), p);

    const merged = ensureUniqueSlugs(Array.from(map.values())).sort((a, b) => {
      const da = parseMaybeDate(a.publishAt || a.date)?.getTime() || 0;
      const db = parseMaybeDate(b.publishAt || b.date)?.getTime() || 0;
      return db - da;
    });

    if (debug) {
      return new Response(
        JSON.stringify(
          {
            meta: {
              version,
              all,
              notionFetched: notionResults.length,
              notionReturned: notionPosts.length,
              staticFetched: staticPosts.length,
              mergedReturned: merged.length,
              pages: nq.meta?.pages,
              has_more: nq.meta?.has_more,
              samplePropertyNames,
              hasStatusField,
              staticDebug,
            },
            posts: merged,
          },
          null,
          2
        ),
        { headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    return new Response(JSON.stringify(merged), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.stack || err) }, null, 2), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
}
