// functions/api/posts.js
export async function onRequest(context) {
  const NOTION_KEY = context.env.NOTION_KEY;
  const DATABASE_ID = context.env.NOTION_DATABASE_ID;

  const url = new URL(context.request.url);
  const all = url.searchParams.get("all") === "1";
  const debug = url.searchParams.get("debug") === "1";
  const version = "posts-api-merge-2026-03-02-02";

  const STATIC_PATH = "/assets/data/posts.json";
  let staticDebug = null;

  const normStr = (v) => String(v ?? "").trim();
  const dateKey = (d) => (normStr(d) ? normStr(d) : "0000-00-00");

  // ---------- Notion safe readers ----------
  const safeText = (prop) => {
    if (!prop) return "";
    if (prop.type === "title") return prop.title?.map((t) => t.plain_text).join("") ?? "";
    if (prop.type === "rich_text") return prop.rich_text?.map((t) => t.plain_text).join("") ?? "";
    if (prop.type === "select") return prop.select?.name ?? "";
    if (prop.type === "multi_select") return prop.multi_select?.map((x) => x?.name).filter(Boolean).join(", ") ?? "";
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

  const safeDate = (prop) => prop?.date?.start ?? "";

  const safeCover = (prop) => {
    const f = prop?.files?.[0];
    if (!f) return "";
    return f.file?.url ?? f.external?.url ?? "";
  };

  const safeFiles = (prop) => {
    const files = prop?.files || [];
    return files.map((f) => f?.file?.url ?? f?.external?.url ?? "").filter(Boolean);
  };

  const safeMultiSelect = (prop) => {
    const arr = prop?.multi_select || [];
    return arr.map((x) => x?.name).filter(Boolean);
  };

  const safePublish = (prop) => {
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
      return { ok: true, results: [], meta: { pages: 0, has_more: false, skipped: true } };
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

    const r1 = await tryQuery([{ property: "date", direction: "descending" }]);
    if (r1.ok) return r1;

    const r2 = await tryQuery([{ timestamp: "created_time", direction: "descending" }]);
    if (r2.ok) return r2;

    return { ok: false, status: 500, error: { error: "Notion API error", detail: r1.detail || r2.detail } };
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

    // ✅ brand：允许 array -> string
    const brand =
      Array.isArray(p.brand) ? p.brand.map((x) => normStr(x)).filter(Boolean).join(", ") : normStr(p.brand);

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

    const slug = rawSlug || rawId; // ✅ 保证有 slug
    const rel = normalizeRelease(p.release_info, rawTitle);

    return {
      id: rawId || slug || rawTitle,
      slug,
      title: rawTitle,
      date: normStr(p.date),
      brand,
      cover,
      summary: normStr(p.summary),

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

  try {
    // 1) Notion
    const nq = await queryNotionAllPages();
    if (!nq.ok) {
      return new Response(JSON.stringify(nq.error || nq.detail || { error: "Notion query failed" }, null, 2), {
        status: nq.status || 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    const notionResults = nq.results || [];

    const CAND = {
      title: ["title", "标题", "Title"],
      slug: ["slug", "Slug", "短链", "文章ID", "id"],
      brand: ["brand", "品牌", "Brand"],
      summary: ["首页摘要", "summary", "home_summary", "excerpt", "摘要", "简介"],
      content: ["content", "正文", "Content", "文章内容"],
      date: ["date", "日期", "Date", "发布时间"],
      cover: ["cover", "封面", "首图", "hero", "thumb", "thumbnail"],
      gallery: ["gallery", "图集", "相册", "images", "Gallery"],
      keywords: ["keywords", "关键词", "tags", "标签", "Topics"],
      publish: ["publish", "published", "发布", "上线", "公开", "Publish"],
      release: ["release_info", "发售信息", "Release", "release", "Release Info"],
    };

    let notionPosts = notionResults
      .map((row) => {
        const props = row.properties || {};

        const titleProp = pickNotionProp(props, CAND.title);
        const slugProp = pickNotionProp(props, CAND.slug);
        const brandProp = pickNotionProp(props, CAND.brand);
        const summaryProp = pickNotionProp(props, CAND.summary);
        const contentProp = pickNotionProp(props, CAND.content);
        const dateProp = pickNotionProp(props, CAND.date);
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
            brand: safeText(brandProp),
            summary: safeText(summaryProp),
            date: safeDate(dateProp),
            cover: safeCover(coverProp),
            content: safeText(contentProp),
            gallery: safeFiles(galleryProp),
            keywords: safeMultiSelect(keywordsProp),
            publish: safePublish(publishProp),
            release_info: safeText(releaseProp),
          },
          "notion"
        );
      })
      .filter(Boolean);

    if (!all) notionPosts = notionPosts.filter((p) => p.publish === true);

    // 2) Static
    const staticRaw = await loadStaticPosts();
    const staticPosts = staticRaw.map((p) => normalizePost(p, "static")).filter(Boolean);

    // 3) Merge: Notion 覆盖 Static（同 slug 视为同一篇）
    const map = new Map();
    for (const p of staticPosts) map.set(String(p.slug || p.id), p);
    for (const p of notionPosts) map.set(String(p.slug || p.id), p);

    const merged = Array.from(map.values()).sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)));

    if (debug) {
      const samplePropertyNames = notionResults?.[0]?.properties ? Object.keys(notionResults[0].properties) : [];
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
