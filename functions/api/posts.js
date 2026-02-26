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
      }),
    });

    const data = await res.json();

    // 如果 Notion 返回报错，把它原样吐出来，方便你排查（不会 1101）
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Notion API error", detail: data }, null, 2), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const safeText = (prop) => {
      if (!prop) return "";
      if (prop.type === "title") return prop.title?.[0]?.plain_text ?? "";
      if (prop.type === "rich_text") return prop.rich_text?.[0]?.plain_text ?? "";
      if (prop.type === "select") return prop.select?.name ?? "";
      return "";
    };

    const safeDate = (prop) => prop?.date?.start ?? "";

    const safeCover = (prop) => {
      const f = prop?.files?.[0];
      if (!f) return "";
      // file / external 两种都可能
      return f.file?.url ?? f.external?.url ?? "";
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
      };
    });

    return new Response(JSON.stringify(posts), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    // 任何异常都返回 JSON（不再 1101）
    return new Response(JSON.stringify({ error: String(err?.stack || err) }, null, 2), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
