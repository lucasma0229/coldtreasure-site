// functions/api/post.js
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const slug = (url.searchParams.get("slug") || "").trim();
  const id = (url.searchParams.get("id") || "").trim();
  const key = (url.searchParams.get("key") || "").trim();
  const all = url.searchParams.get("all") === "1";

  const k = slug || id || key;
  if (!k) {
    return new Response(JSON.stringify({ error: "Missing slug/id" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  // 复用 /api/posts 的结果，找到单篇（简单可靠）
  const postsUrl = new URL("/api/posts", url.origin);
  if (all) postsUrl.searchParams.set("all", "1");
  postsUrl.searchParams.set("v", String(Date.now()));

  const res = await fetch(postsUrl.toString(), { cache: "no-store" });
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    return new Response(JSON.stringify({ error: "Failed to load posts", detail: data }), {
      status: res.status || 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const list = Array.isArray(data) ? data : Array.isArray(data?.posts) ? data.posts : [];
  const hit = list.find((p) => String(p?.slug || "").trim() === k || String(p?.id || "").trim() === k);

  if (!hit) {
    return new Response(JSON.stringify({ error: "Post not found", key: k }), {
      status: 404,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  return new Response(JSON.stringify(hit), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
