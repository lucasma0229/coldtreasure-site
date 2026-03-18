export async function onRequest(context) {
  const NOTION_KEY = context.env.NOTION_KEY;
  const DATABASE_ID = context.env.NOTION_HOMEPAGE_HERO;

  if (!NOTION_KEY || !DATABASE_ID) {
    return new Response(
      JSON.stringify({ error: "Missing NOTION_KEY or DATABASE_ID" }),
      { status: 500 }
    );
  }

  const res = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NOTION_KEY}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
  });

  const data = await res.json();

  const hero = (data.results || [])
    .map((row) => {
      const p = row.properties;

      return {
        title: p.title?.title?.map((t) => t.plain_text).join("") || "",
        image: p.image?.url || "",
        link: p.link?.url || "",
        order: p.order?.number ?? 0,
        active: p.active?.checkbox ?? true,
      };
    })
    .filter((i) => i.active && i.image)
    .sort((a, b) => a.order - b.order);

  return new Response(
    JSON.stringify({
      hero,
      modules: [], // 🔥 预留未来
    }),
    {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }
  );
}
