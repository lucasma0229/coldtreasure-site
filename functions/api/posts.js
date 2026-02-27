export async function onRequest(context) {
  const NOTION_KEY = context.env.NOTION_KEY;
  const DATABASE_ID = context.env.NOTION_DATABASE_ID;

  const url = new URL(context.request.url);
  const all = url.searchParams.get("all") === "1";
  const debug = url.searchParams.get("debug") === "1";

  if (!NOTION_KEY || !DATABASE_ID) {
    return new Response(JSON.stringify({ error: "Missing env: NOTION_KEY or NOTION_DATABASE_ID" }, null, 2), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const safeText = (prop) => {
    if (!prop) return "";
    if (prop.type === "title") return prop.title?.map(t => t.plain_text).join("") ?? "";
    if (prop.type === "rich_text") return prop.rich_text?.map(t => t.plain_text).join("") ?? "";
    if (prop.type === "select") return prop.select?.name ?? "";
    // ✅ 常见：formula/string
    if (prop.type === "formula") return prop.formula?.string ?? "";
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

  // ✅ 自动分页拿全量（避免 has_more 情况下只拿到第一页）
  async function queryAllPages() {
    let start_cursor = undefined;
    const out = [];
    let has_more = false;
    let pages = 0;

    do {
      const body = {
        page_size: 100,
        sorts: [{ property: "date", direction: "descending" }],
        ...(all ? {} : { filter: { property: "publish", checkbox: { equals: true } } }),
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
        return { error: { message: "Notion API error", detail: data }, status: 500 };
      }

      const results = data?.results || [];
      out.push(...results);

      has_more = !!data?.has_more;
      start_cursor = data?.next_cursor || undefined;
      pages += 1;

      // 防御：避免异常无限循环
      if (pages > 20) break;
    } while (has_more);

    return { results: out, meta: { has_more, pages } };
  }

  try {
    const q = await queryAllPages();
    if (q.error) {
      return new Response(JSON.stringify(q.error, null, 2), {
        status: q.status || 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    const results = q.results || [];
    const posts = results.map((p) => {
      const props = p.properties || {};
      return {
        id: p.id,
        title: safeText(props.title),
        slug: safeText(props.slug),
        cover: safeCover(props.cover),
        date: safeDate(props.date),
        content: safeText(props.content),
        gallery: safeFiles(props.gallery),
        keywords: safeMultiSelect(props.keywords),
      };
    });

    if (debug) {
      // 输出 propertyNames 帮你确认列名是否匹配
      const propertyNames = results?.[0]?.properties ? Object.keys(results[0].properties) : [];
      return new Response(JSON.stringify({
        meta: {
          all,
          totalFetched: results.length,
          pages: q.meta?.pages,
          has_more: q.meta?.has_more,
          samplePropertyNames: propertyNames,
          sampleFirstPost: posts[0] || null,
        },
        posts,
      }, null, 2), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    return new Response(JSON.stringify(posts), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.stack || err) }, null, 2), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
}
