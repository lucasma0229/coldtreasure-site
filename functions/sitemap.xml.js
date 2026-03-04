// /functions/sitemap.xml.js
export async function onRequest(context) {
  const SITE_URL = (context.env.SITE_URL || "https://coldtreasure.com").replace(/\/$/, "");

  const urls = [];

  const today = new Date().toISOString().slice(0, 10);

  // 1) 基础页面
  urls.push({ loc: `${SITE_URL}/`, lastmod: today });
  urls.push({ loc: `${SITE_URL}/news/`, lastmod: today });

  // 2) 旧文章（GitHub静态/历史）
  try {
    const legacy = await import("../data/legacy-posts.json", { with: { type: "json" } });
    for (const item of legacy.default || []) {
      if (!item?.slug) continue;
      urls.push({
        loc: `${SITE_URL}/post/${encodeURIComponent(String(item.slug))}`,
        lastmod: (item.lastmod || "").slice(0, 10) || undefined,
      });
    }
  } catch (e) {
    // 没有 legacy 文件也没关系
  }

  // 3) ✅ 新文章（动态）：统一从 /api/posts 读取（发布流唯一真相源）
  try {
    const origin = new URL(context.request.url).origin;
    const apiUrl = new URL("/api/posts", origin);
    apiUrl.searchParams.set("v", String(Date.now()));

    const res = await fetch(apiUrl.toString(), { cache: "no-store" });
    const data = await res.json().catch(() => null);

    if (res.ok) {
      const posts = Array.isArray(data) ? data : Array.isArray(data?.posts) ? data.posts : [];

      for (const p of posts) {
        const slug = String(p?.slug || "").trim();
        if (!slug) continue;

        // lastmod：优先 notion last edited（如果你未来在 posts.js 里带出来），否则用 date/publishAt，否则 today
        const lastmod =
          String(p?.lastmod || "").slice(0, 10) ||
          String(p?.last_edited_time || "").slice(0, 10) ||
          String(p?.publishAt || "").slice(0, 10) ||
          String(p?.date || "").slice(0, 10) ||
          today;

        urls.push({
          loc: `${SITE_URL}/post/${encodeURIComponent(slug)}`,
          lastmod,
        });
      }
    }
  } catch (e) {
    // /api/posts 失败时，sitemap 仍能返回基础页 + legacy（不会 500）
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
  return String(str)
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
