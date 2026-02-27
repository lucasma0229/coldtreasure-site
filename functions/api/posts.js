// functions/api/posts.js
export async function onRequest(context) {
  const NOTION_KEY = context.env.NOTION_KEY;
  const DATABASE_ID = context.env.NOTION_DATABASE_ID;

  const url = new URL(context.request.url);
  const all = url.searchParams.get("all") === "1";
  const debug = url.searchParams.get("debug") === "1";

  const version = "posts-api-merge-2026-02-27-02";

  // 静态 JSON 真实路径（你已确认浏览器能打开）
  const STATIC_PATH = "/assets/data/posts.json";

  // 用于 debug：告诉我们静态源到底怎么失败的
  let staticDebug = null;

  // ---------- Safe readers (Notion props) ----------
  const safeText = (prop) => {
    if (!prop) return "";
    if (prop.type === "title") return prop.title?.map(t => t.plain_text).join("") ?? "";
    if (prop.type === "rich_text") return prop.rich_text?.map(t => t.plain_text).join("") ?? "";
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
    return files.map(f => f?.file?.url ?? f?.external?.url ?? "").filter(Boolean);
  };

  const safeMultiSelect = (prop) => {
    const arr = prop?.multi_select || [];
    return arr.map(x => x?.name).filter(Boolean);
  };

  const safeCheckbox = (prop) => (prop?.type === "checkbox" ? !!prop.checkbox : false);

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
          "Authorization": `Bearer ${NOTION_KEY}`,
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

      if (pages > 20) break; // 防御
    } while (has_more);

    return { ok: true, results: out, meta: { pages, has_more } };
  }

  // ---------- Load static posts.json (robust) ----------
  // 策略：
  // 1) 优先：ASSETS.fetch（如果存在）
  // 2) fallback：同源 fetch（用真实 origin + cache bust），并尽量避免缓存
  async function loadStaticPosts() {
    const origin = url.origin;
    const bust = `v=${Date.now()}`;
    const absoluteUrl = `${origin}${STATIC_PATH}?${bust}`;

    // helper to parse
    const parseJsonArray = async (res, channel) => {
      const ct = res.headers.get("content-type") || "";
      const text = await res.text();

      // debug 记录（只记录第一次成功/失败的信息，避免太长）
      if (!staticDebug) {
        staticDebug = {
          channel,
          requested: channel === "ASSETS" ? `https://static${STATIC_PATH}` : absoluteUrl,
          status: res.status,
          ok: res.ok,
          contentType: ct,
          head: text.slice(0, 120),
          hasASSETS: !!context.env.ASSETS,
        };
      }

      if (!res.ok) return [];
      const trimmed = text.trim();
      if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return [];

      const data = JSON.parse(trimmed);
      const arr = Array.isArray(data) ? data : (Array.isArray(data?.posts) ? data.posts : []);
      return Array.isArray(arr) ? arr : [];
    };

    // 1) ASSETS.fetch
    try {
      if (context.env.ASSETS?.fetch) {
        // 更稳的写法：给一个“正常 host”，只取 pathname
        const reqUrl = new URL(STATIC_PATH, "https://assets.local");
        const res = await context.env.ASSETS.fetch(new Request(reqUrl.toString()));
        const arr = await parseJsonArray(res, "ASSETS");
        if (arr.length) return arr;

        // 如果 ASSETS 返回了但解析不到（例如返回 HTML），继续 fallback
      }
    } catch (e) {
      if (!staticDebug) staticDebug = { channel: "ASSETS", error: String(e?.message || e), hasASSETS: !!context.env.ASSETS };
    }

    // 2) fallback：同源 fetch
    try {
      const res = await fetch(absoluteUrl, {
        cache: "no-store",
        // cf 参数对 Pages/Workers 有用（尽量不缓存）
        cf: { cacheTtl: 0, cacheEverything: false },
      });
      const arr = await parseJsonArray(res, "ORIGIN_FETCH");
      return arr;
    } catch (e) {
      if (!staticDebug) staticDebug = { channel: "ORIGIN_FETCH", error: String(e?.message || e) };
      return [];
    }
  }

  // ---------- Normalize + merge ----------
  function normalizePost(p, source) {
    if (!p) return null;

    // 旧 posts.json 里一般用 id；Notion 用 slug
    const id = String(p.id || "").trim();
    const slug = String(p.slug || "").trim();
    const title = String(p.title || "").trim();

    if (!id && !slug && !title) return null;

    // 兼容旧数据：hero/image/thumb 也可能存在
    const cover = p.cover || p.hero || p.image || p.thumb || "";

    return {
      id: p.id || slug || id || title,
      title,
      slug: slug || id, // 没 slug 的旧文，用 id 兜底
      cover,
      date: p.date || "",
      content: typeof p.content === "string" ? p.content : (p.content ? JSON.stringify(p.content) : ""),
      gallery: Array.isArray(p.gallery) ? p.gallery : [],
      keywords: Array.isArray(p.keywords) ? p.keywords : (Array.isArray(p.tags) ? p.tags : []),
      publish: typeof p.publish === "boolean" ? p.publish : true, // 静态源默认已发布
      brand: p.brand || "",
      release_info: p.release_info || "",
      source,
    };
  }

  function dateKey(d) {
    const s = String(d || "").trim();
    return s ? s : "0000-00-00";
  }

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
            release_info: safeText(props.release_info),
          },
          "notion"
        );
      })
      .filter(Boolean);

    // 默认只吐 publish=true 的 Notion；?all=1 则吐全部
    if (!all) notionPosts = notionPosts.filter(p => p.publish === true);

    // 2) Static
    const staticRaw = await loadStaticPosts();
    const staticPosts = staticRaw.map(p => normalizePost(p, "static")).filter(Boolean);

    // 3) Merge（Notion 覆盖静态：同 slug 认为同一篇）
    const map = new Map();

    for (const p of staticPosts) {
      map.set(String(p.slug || p.id), p);
    }
    for (const p of notionPosts) {
      map.set(String(p.slug || p.id), p);
    }

    const merged = Array.from(map.values()).sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)));

    // Debug response
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

    // 默认：返回数组（兼容你 Search 现有写法）
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
