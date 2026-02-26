export async function onRequest(context) {
  const NOTION_KEY = context.env.NOTION_KEY;
  const DATABASE_ID = context.env.NOTION_DATABASE_ID;

  const res = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${NOTION_KEY}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28"
    },
    body: JSON.stringify({
      filter: {
        property: "publish",
        checkbox: { equals: true }
      },
      sorts: [
        {
          property: "date",
          direction: "descending"
        }
      ]
    })
  });

  const data = await res.json();

  const posts = data.results.map(p => ({
    id: p.id,
    title: p.properties.title?.title?.[0]?.plain_text || "",
    slug: p.properties.slug?.rich_text?.[0]?.plain_text || "",
    cover: (p.properties.cover?.files?.[0]?.file?.url) || (p.properties.cover?.files?.[0]?.external?.url) || "",
    date: p.properties.date?.date?.start || "",
    content: p.properties.content?.rich_text?.[0]?.plain_text || ""
  }));

  return new Response(JSON.stringify(posts), {
    headers: { "Content-Type": "application/json" }
  });
}
