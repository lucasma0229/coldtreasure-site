// /functions/sitemap.xml.js
export async function onRequest(context) {
  const SITE_URL = (context.env.SITE_URL || "https://coldtreasure.com").replace(/\/$/, "");
  const NOTION_TOKEN = context.env.NOTION_TOKEN;
  const NOTION_DATABASE_ID = context.env.NOTION_DATABASE_ID;

  const urls = [];

  // 1) 基础页面
  urls.push({ loc: `${SITE_URL}/`, lastmod: new Date().toISOString().slice(0, 10) });
  urls.push({ loc: `${SITE_URL}/news/`, lastmod: new Date().toISOString().slice(0, 10) });

  // 2) 旧文章（GitHub静态/历史）
  try {
    const legacy = await import("../data/legacy-posts.json", { with: { type: "json" } });
    for (const item of (legacy.default || [])) {
      if (!item?.slug) continue;
      urls.push({
        loc: `${SITE_URL}/post/${item.slug}`,
        lastmod: (item.lastmod || "").slice(0, 10) || undefined,
      });
    }
  } catch (e) {
    // 没有 legacy 文件也没关系
  }

  // 3) Notion 新文章（动态）
  if (NOTION_TOKEN && NOTION_DATABASE_ID) {
    const notionPosts = await fetchAllNotionPosts({
      token: NOTION_TOKEN,
      dbId: NOTION_DATABASE_ID,
    });

    for (const p of notionPosts) {
      if (!p.slug) continue;
      urls.push({
        loc: `${SITE_URL}/post/${p.slug}`,
        lastmod: p.lastmod,
      });
    }
  }

  // 去重（以 loc 为准）
  const map = new Map();
  for (const u of urls) map.set(u.loc, u);
  const deduped = [...map.values()];

  const xml = buildSitemapXml(deduped);

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=UTF-8",
      // 缓存：给 Google/访客缓存 30 分钟；你更新 Notion 后半小时内会自动更新
      "cache-control": "public, max-age=0, s-maxage=1800",
    },
  });
}

// ------- helpers -------

function escapeXml(str = "") {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildSitemapXml(urls) {
  const items = urls
    .map((u) => {
      const lastmodTag = u.lastmod ? `\n    <lastmod>${escapeXml(u.lastmod)}</lastmod>` : "";
      return `  <url>
    <loc>${escapeXml(u.loc)}</loc>${lastmodTag}
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</urlset>`;
}

async function fetchAllNotionPosts({ token, dbId }) {
  const out = [];
  let cursor = undefined;

  // 你可以在这里改成“只收录已发布文章”的规则（比如 Status=Published）
  // 目前先不加过滤，确保能跑通
  while (true) {
    const body = {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    };

    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${token}`,
        "content-type": "application/json",
        "notion-version": "2022-06-28",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) break;

    const data = await res.json();

    for (const row of data.results || []) {
      // 这里需要从你的数据库字段里拿 slug
      // 你之前的结构里应该已经有 slug 字段；常见是 rich_text 或 title
      const slug =
        row?.properties?.slug?.rich_text?.[0]?.plain_text ||
        row?.properties?.Slug?.rich_text?.[0]?.plain_text ||
        row?.properties?.slug?.title?.[0]?.plain_text ||
        row?.properties?.Slug?.title?.[0]?.plain_text ||
        "";

      const lastmod = (row?.last_edited_time || "").slice(0, 10);

      if (slug) out.push({ slug, lastmod });
    }

    if (!data.has_more) break;
    cursor = data.next_cursor;
  }

  return out;
}
