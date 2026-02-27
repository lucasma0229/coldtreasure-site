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

    if (prop.type === "title") {
      return prop.title?.map(t => t.plain_text).join("") ?? "";
    }

    if (prop.type === "rich_text") {
      return prop.rich_text?.map(t => t.plain_text).join("") ?? "";
    }

    if (prop.type === "select") {
      return prop.select?.name ?? "";
    }

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

  // ✅ publish 强兼容：checkbox / formula(boolean) / rollup / select/status(按名字) / rich_text(按内容)
  const safePublish = (prop) => {
    if (!prop) return false;

    // 1) checkbox
    if (prop.type === "checkbox") return !!prop.checkbox;

    // 2) formula boolean
    if (prop.type === "formula") {
      if (typeof prop.formula?.boolean === "boolean") return prop.formula.boolean;
      // 有人用 formula 输出字符串 "true"/"false"
      const s = String(prop.formula?.string ?? "").toLowerCase().trim();
      if (s === "true" || s === "yes" || s === "1") return true;
      if (s === "false" || s === "no" || s === "0") return false;
      return false;
    }

    // 3) rollup
    if (prop.type === "rollup") {
      const r = prop.rollup;
      if (!r) return false;

      // rollup number > 0
      if (r.type === "number") return (r.number ?? 0) > 0;

      // rollup array: any checkbox true or any select/status named "Published"
      if (r.type === "array" && Array.isArray(r.array)) {
        for (const it of r.array) {
          if (it?.type === "checkbox" && it.checkbox === true) return true;
          if (it?.type === "select" && it.select?.name) {
            const name = it.select.name.toLowerCase();
            if (name === "published" || name === "publish" || name === "true" || name === "yes") return true;
          }
          if (it?.type === "status" && it.status?.name) {
            const name = it.status.name.toLowerCase();
            if (name === "published" || name === "publish") return true;
          }
        }
      }
      return false;
    }

    // 4) select/status：名字判断（你也可以按自己 Notion 设定改关键词）
    if (prop.type === "select" && prop.select?.name) {
      const name = prop.select.name.toLowerCase();
      return name === "published" || name === "publish" || name === "true" || name === "yes";
    }
    if (prop.type === "status" && prop.status?.name) {
      const name = prop.status.name.toLowerCase();
      return name === "published" || name === "publish";
    }

    // 5) rich_text/title：内容判断（兜底）
    if (prop.type === "rich_text") {
      const t = prop.rich_text?.map(x => x.plain_text).join("").toLowerCase().trim() ?? "";
      return t === "true" || t === "yes" || t === "published" || t === "publish" || t === "1";
    }
    if (prop.type === "title") {
      const t = prop.title?.map(x => x.plain_text).join("").toLowerCase().trim() ?? "";
      return t === "true" || t === "yes" || t === "published" || t === "publish" || t === "1";
    }

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
        publish: safePublish(props.publish),
        brand: safeText(props.brand),
        release_info: safeText(props.release_info),
      };
    });

    if (!all) {
      posts = posts.filter(p => p.publish === true);
    }

    if (debug) {
      const samplePropertyNames = results?.[0]?.properties ? Object.keys(results[0].properties) : [];
      // 额外输出 publish 类型，帮你一次确认 Notion 的真实类型
      const samplePublishType = results?.[0]?.properties?.publish?.type ?? null;

      return new Response(
        JSON.stringify({
          meta: {
            all,
            totalFetched: results.length,
            returned: posts.length,
            pages: q.meta?.pages,
            has_more: q.meta?.has_more,
            samplePropertyNames,
            samplePublishType,
            sampleFirstPost: posts[0] || null,
          },
          posts,
        }, null, 2),
        { headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
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
