// functions/api/posts.js
export async function onRequest(context) {
  const NOTION_KEY = context.env.NOTION_KEY;
  const DATABASE_ID = context.env.NOTION_DATABASE_ID;

  const url = new URL(context.request.url);
  const all = url.searchParams.get("all") === "1";
  const debug = url.searchParams.get("debug") === "1";

  // 旧源（静态）位置：你 repo 里是 /assets/data/posts.json
  const STATIC_POSTS_URL = `${url.origin}/assets/data/posts.json?v=${Date.now()}`;

  const version = "posts-api-merge-2026-02-27-01";

  // ---------- Safe readers ----------
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
    return files
      .map((f) => f?.file?.url ?? f?.external?.url ?? "")
      .filter(Boolean);
  };

  const safeMultiSelect = (prop) => {
    const arr = prop?.multi_select || [];
    return arr.map((x) => x?.name).filter(Boolean);
  };

  const safeCheckbox = (prop) => (prop?.type === "checkbox" ? !!prop.checkbox : false);

  // ---------- Notion query with auto pagination ----------
  async function queryNotionAllPages() {
    if (!NOTION_KEY || !DATABASE_ID) {
      // 没配 Notion env 时也允许继续（只返回静态源）
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

      if (pages > 20) break;
    } while (has_more);

    return { ok: true, results: out, meta: { pages, has_more } };
  }

  // ---------- Load static posts.json ----------
  async function loadStaticPosts() {
    try {
      const res = await fetch(STATIC_POSTS_URL, { cf: { cacheTtl: 0 }, cache: "no-store" });
      if (!res.ok) return [];
      const data = await res.json().catch(() => null);
      const arr = Array.isArray(data) ? data : (Array.isArray(data?.posts) ? data.posts : []);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  // ---------- Normalize post shape (for merge) ----------
  function normalizePost(p) {
    if (!p) return null;
    const slug = String(p.slug || "").trim();
    const title = String(p.title || "").trim();
    if (!slug && !title) return null;

    return {
      id: p.id || slug || title,
      title,
      slug,
      cover: p.cover || "",
      date: p.date || "",
      content: p.content || "",
      gallery: Array.isArray(p.gallery) ? p.gallery : [],
      keywords: Array.isArray(p.keywords) ? p.keywords : [],
      publish: typeof p.publish === "boolean" ? p.publish : true, // 静态源默认认为已发布
      brand: p.brand || "",
      release_info: p.release_info || "",
      source: p.source || "static",
    };
  }

  function dateKey(d) {
    // 让排序更稳定：YYYY-MM-DD 直接可比；空日期放后面
    const s = String(d || "").trim();
    return s ? s : "0000-00-00";
  }

  try {
    // 1) 拉 Notion
    const nq = await queryNotionAllPages();
    if (!nq.ok) {
      return new Response(JSON.stringify(nq.error, null, 2), {
        status: nq.status || 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    const notionResults = nq.results || [];
    let notionPosts = notionResults.map((row) => {
      const props = row.properties || {};
      return normalizePost({
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
        source: "notion",
      });
    }).filter(Boolean);

    // 默认只吐 notion publish=true；?all=1 则吐全部 notion（包含 publish=false）
    if (!all) notionPosts = notionPosts.filter(p => p.publish === true);

    // 2) 拉静态 posts.json
    const staticRaw = await loadStaticPosts();
    const staticPosts = staticRaw.map(p => normalizePost({ ...p, source: "static" })).filter(Boolean);

    // 3) 合并：Notion 优先覆盖静态（同 slug 认为同一篇）
    const map = new Map();
    for (const p of staticPosts) {
      map.set(p.slug || p.id, p);
    }
    for (const p of notionPosts) {
      map.set(p.slug || p.id, p); // notion override
    }

    const merged = Array.from(map.values())
      .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)));

    if (debug) {
      const samplePropertyNames = notionResults?.[0]?.properties ? Object.keys(notionResults[0].properties) : [];
      return new Response(JSON.stringify({
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
        },
        posts: merged,
      }, null, 2), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // 返回数组：兼容你现有 Search 逻辑
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
