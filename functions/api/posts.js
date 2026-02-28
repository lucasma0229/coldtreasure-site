// functions/api/posts.js
export async function onRequest(context) {
  const NOTION_KEY = context.env.NOTION_KEY;
  const DATABASE_ID = context.env.NOTION_DATABASE_ID;

  const url = new URL(context.request.url);
  const all = url.searchParams.get("all") === "1";
  const debug = url.searchParams.get("debug") === "1";

  const version = "posts-api-merge-2026-02-28-02";

  // 你已确认可访问
  const STATIC_PATH = "/assets/data/posts.json";
  let staticDebug = null;

  // ---------- Safe readers (Notion props) ----------
  const safeText = (prop) => {
    if (!prop) return "";
    if (prop.type === "title") return prop.title?.map((t) => t.plain_text).join("") ?? "";
    if (prop.type === "rich_text") return prop.rich_text?.map((t) => t.plain_text).join("") ?? "";
    if (prop.type === "select") return prop.select?.name ?? "";
    if (prop.type === "formula") {
      return (
        prop.formula?.string ??
        (prop.formula?.number != null ? String(prop.formula.number) : "") ??
        (prop.formula?.boolean != null ? String(prop.formula.boolean) : "") ??
        ""
      );
    }
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

  const safeCheckbox = (prop) => (prop?.type === "checkbox" ? !!prop.checkbox : false);

  // 兼容：Notion 字段名可能是中文“首页摘要”
  const pickNotionProp = (props, candidates = []) => {
    for (const key of candidates) {
      if (props && props[key]) return props[key];
    }
    return null;
  };

  // ---------- Notion query with auto pagination ----------
  async function queryNotionAllPages() {
    // 没配 Notion 也能工作（只返回静态源）
    if (!NOTION_KEY || !DATABASE_ID) {
      return { ok: true, results: [], meta: { pages: 0, has_more: false, skipped: true } };
    }

    let start_cursor = undefined;
    const out = [];
    let has_more = false;
    let pages = 0;

    do {
      const body = {
        page_size: 100,
        sorts: [{ property: "date", direction: "descending" }],
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
      if (!res.ok) {
        return { ok: false, status: 500, error: { error: "Notion API error", detail: data } };
      }

      out.push(...(data?.results || []));
      has_more = !!data?.has_more;
      start_cursor = data?.next_cursor || undefined;
      pages += 1;

      if (pages > 20) break; // 防护：最多 2000 条
    } while (has_more);

    return { ok: true, results: out, meta: { pages, has_more } };
  }

  // ---------- Load static posts.json (robust) ----------
  async function loadStaticPosts() {
    const origin = url.origin;
    const bust = `v=${Date.now()}`;
    const absoluteUrl = `${origin}${STATIC_PATH}?${bust}`;

    const parseJsonArray = async (res, channel) => {
      const ct = res.headers.get("content-type") || "";
      const text = await res.text();

      if (!staticDebug) {
        staticDebug = {
          channel,
          requested: channel === "ASSETS" ? `https://static${STATIC_PATH}` : absoluteUrl,
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

    // 1) ASSETS.fetch（Cloudflare Pages Functions 常见用法）
    try {
      if (context.env.ASSETS?.fetch) {
        const reqUrl = new URL(STATIC_PATH, "https://assets.local");
        const res = await context.env.ASSETS.fetch(new Request(reqUrl.toString()));
        const arr = await parseJsonArray(res, "ASSETS");
        if (arr.length) return arr;
      }
    } catch (e) {
      if (!staticDebug) staticDebug = { channel: "ASSETS", error: String(e?.message || e), hasASSETS: !!context.env.ASSETS };
    }

    // 2) fallback：同源 fetch
    try {
      const res = await fetch(absoluteUrl, {
        cache: "no-store",
        cf: { cacheTtl: 0, cacheEverything: false },
      });
      return await parseJsonArray(res, "ORIGIN_FETCH");
    } catch (e) {
      if (!staticDebug) staticDebug = { channel: "ORIGIN_FETCH", error: String(e?.message || e) };
      return [];
    }
  }

  // ---------- Helpers: normalize / derive ----------
  const normStr = (v) => String(v ?? "").trim();

  // 把静态 content(blocks) 转成可搜索的纯文本（给 Search/News 摘要用）
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

  // ✅ 结构化 release：在 API 端先做“去噪/去重复”
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

      // 过滤掉“发售信息 / Release Info”这类标题行（避免正文/模块重复）
      if (line === "发售信息" || low === "release info" || low === "release information") continue;

      // 过滤掉 “鞋款：{title}” 这类重复（你截图中的问题）
      if (line.startsWith("鞋款：") && t) {
        const val = normStr(line.replace(/^鞋款：/, ""));
        if (val === t || val.includes(t)) continue;
      }

      // 额外保险：如果有人写 “标题：xxx”
      if ((line.startsWith("标题：") || line.startsWith("Title:")) && t) {
        const val = normStr(line.replace(/^标题：|^Title:/, ""));
        if (val === t || val.includes(t)) continue;
      }

      filtered.push(line);
    }

    return {
      release_info: filtered.join("\n"), // 兼容旧前端：仍然给 string
      release_lines: filtered,          // ✅ 新结构：给新版 post.js 使用
    };
  }

  function normalizePost(p, source) {
    if (!p) return null;

    const rawId = normStr(p.id);
    const rawSlug = normStr(p.slug);
    const rawTitle = normStr(p.title);

    if (!rawId && !rawSlug && !rawTitle) return null;

    // 兼容旧数据：hero/image/thumb
    const cover = normStr(p.cover || p.hero || p.image || p.thumb);

    // content：可能是 string，也可能是 blocks array
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

    // summary：静态源常用 summary；Notion 我们会映射 summary
    const summary = normStr(p.summary);

    const date = normStr(p.date);
    const brand = normStr(p.brand);

    // ✅ release 标准化
    const rel = normalizeRelease(p.release_info, rawTitle);

    // slug 兜底：没有 slug 的旧文用 id
    const slug = rawSlug || rawId;

    return {
      id: rawId || slug || rawTitle,
      slug,
      title: rawTitle,
      date,
      brand,
      cover,
      summary,                  // ✅ 首页摘要 / 列表摘要

      release_info: rel.release_info,     // ✅ 兼容旧逻辑（string）
      release_lines: rel.release_lines,   // ✅ 新结构（array）

      keywords: Array.isArray(p.keywords) ? p.keywords : Array.isArray(p.tags) ? p.tags : [],
      gallery: Array.isArray(p.gallery) ? p.gallery : [],
      publish: typeof p.publish === "boolean" ? p.publish : true,

      // ✅ 关键：同时给两种 content
      content: content_text,    // 给旧逻辑/搜索用（string）
      content_blocks,           // 给新版 post.js 用（结构化数组）
      source,
    };
  }

  const dateKey = (d) => (normStr(d) ? normStr(d) : "0000-00-00");

  try {
    // 1) Notion
    const nq = await queryNotionAllPages();
    if (!nq.ok) {
      return new Response(JSON.stringify(nq.error, null, 2), {
        status: nq.status || 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    const notionResults = nq.results || [];
    let notionPosts = notionResults
      .map((row) => {
        const props = row.properties || {};

        // ✅ 兼容“首页摘要”字段名（也兼容 summary/home_summary/excerpt 这种英文命名）
        const summaryProp = pickNotionProp(props, ["首页摘要", "summary", "home_summary", "excerpt"]);
        const summary = safeText(summaryProp);

        // ✅ release_info 字段（仍从 Notion 取文本，但在 normalizePost 内会结构化+去重复）
        const releaseProp = pickNotionProp(props, ["release_info", "发售信息", "Release", "release"]);
        const release_info = safeText(releaseProp);

        return normalizePost(
          {
            id: row.id,
            title: safeText(props.title),
            slug: safeText(props.slug),
            cover: safeCover(props.cover),
            date: safeDate(props.date),
            content: safeText(props.content),
            gallery: safeFiles(props.gallery),
            keywords: safeMultiSelect(props.keywords),
            publish: safeCheckbox(props.publish),
            brand: safeText(props.brand),
            release_info,
            summary,
          },
          "notion"
        );
      })
      .filter(Boolean);

    if (!all) notionPosts = notionPosts.filter((p) => p.publish === true);

    // 2) Static
    const staticRaw = await loadStaticPosts();
    const staticPosts = staticRaw.map((p) => normalizePost(p, "static")).filter(Boolean);

    // 3) Merge：Notion 覆盖静态（同 slug 认为同一篇）
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

    // 默认：数组（兼容现有前端）
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
