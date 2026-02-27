// functions/api/posts.js
export async function onRequest(context) {
  const NOTION_KEY = context.env.NOTION_KEY;
  const DATABASE_ID = context.env.NOTION_DATABASE_ID;

  const url = new URL(context.request.url);
  const all = url.searchParams.get("all") === "1";
  const debug = url.searchParams.get("debug") === "1";

  if (!NOTION_KEY || !DATABASE_ID) {
    return new Response(
      JSON.stringify({ error: "Missing env: NOTION_KEY or NOTION_DATABASE_ID" }, null, 2),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }

  // ---------- Safe readers ----------
  const safeText = (prop) => {
    if (!prop) return "";

    // title
    if (prop.type === "title") {
      return prop.title?.map(t => t.plain_text).join("") ?? "";
    }

    // rich_text
    if (prop.type === "rich_text") {
      return prop.rich_text?.map(t => t.plain_text).join("") ?? "";
    }

    // select
    if (prop.type === "select") {
      return prop.select?.name ?? "";
    }

    // formula (often used for computed slug)
    if (prop.type === "formula") {
      // Notion formula may be string/number/boolean/date
      return (
        prop.formula?.string ??
        (prop.formula?.number != null ? String(prop.formula.number) : "") ??
        (prop.formula?.boolean != null ? String(prop.formula.boolean) : "") ??
        ""
      );
    }

    // fallback: try common containers
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

  const safeCheckbox = (prop) => {
    // If property is checkbox type
    if (prop?.type === "checkbox") return !!prop.checkbox;
    // If property exists but not checkbox, treat as false
    return false;
  };

  // ---------- Notion query with auto pagination ----------
  async function queryAllPages() {
    let start_cursor = undefined;
    const out = [];
    let has_more = false;
    let pages = 0;

    do {
      const body = {
        page_size: 100,
        // 这里保留 date 排序；如果 Notion 里 date 不是 date 类型，会影响排序但不影响拉取
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

      const results = data?.results || [];
      out.push(...results);

      has_more = !!data?.has_more;
      start_cursor = data?.next_cursor || undefined;
      pages += 1;

      // 防御：避免异常导致循环
      if (pages > 20) break;
    } while (has_more);

    return { ok: true, results: out, meta: { pages, has_more } };
  }

  try {
    const q = await queryAllPages();
    if (!q.ok) {
      return new Response(JSON.stringify(q.error, null, 2), {
        status: q.status || 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    const results = q.results || [];

    // 映射成前端消费结构
    let posts = results.map((p) => {
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
        // 在服务器端做 publish 判断（别在 Notion query filter 里做）
        publish: safeCheckbox(props.publish),
        // 可选：如果你以后要用这些字段
        brand: safeText(props.brand),
        release_info: safeText(props.release_info),
      };
    });

    // 默认只吐 publish=true；?all=1 则吐全部
    if (!all) {
      posts = posts.filter(p => p.publish === true);
    }

    // debug 输出 meta（方便你核对列名/数量）
    if (debug) {
      const samplePropertyNames = results?.[0]?.properties ? Object.keys(results[0].properties) : [];
      return new Response(
        JSON.stringify({
          meta: {
            all,
            totalFetched: results.length,
            returned: posts.length,
            pages: q.meta?.pages,
            has_more: q.meta?.has_more,
            samplePropertyNames,
            sampleFirstPost: posts[0] || null,
          },
          posts,
        }, null, 2),
        { headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    // 默认：直接返回数组（兼容现有 Search）
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
