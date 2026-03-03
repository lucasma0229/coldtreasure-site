export async function onRequest(context) {
  const SITE_URL = (context.env.SITE_URL || "https://coldtreasure.com").replace(/\/$/, "");
  const body = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=UTF-8",
      "cache-control": "public, max-age=0, s-maxage=3600"
    }
  });
}
