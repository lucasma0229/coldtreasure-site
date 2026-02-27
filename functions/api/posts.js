export async function onRequest(context) {
  const NOTION_KEY = context.env.NOTION_KEY;
  const DATABASE_ID = context.env.NOTION_DATABASE_ID;

  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_KEY}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        filter: { property: "publish", checkbox: { equals: true } },
        sorts: [{ property: "date", direction: "descending" }],
        page_size: 100,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Notion API error", detail: data }, null, 2), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const safeText = (prop) => {
      if (!prop) return "";
      if (prop.type === "title") return prop.title?.map(t => t.plain_text).join("") ?? "";
      if (prop.type === "rich_text") return prop.rich_text?.map(t => t.plain_text).join("") ?? "";
      if (prop.type === "select") return prop.select?.name ?? "";
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

    const posts = (data.results || []).map((p) => {
      const props = p.properties || {};
      return {
        id: p.id,
        title: safeText(props.title),
        slug: safeText(props.slug),
        cover: safeCover(props.cover),
        date: safeDate(props.date),
        content: safeText(props.content),

        // ✅ 新增：gallery + keywords（你后面 search 用得上）
        gallery: safeFiles(props.gallery),
        keywords: safeMultiSelect(props.keywords),
      };
    });

    return new Response(JSON.stringify(posts), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.stack || err) }, null, 2), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
