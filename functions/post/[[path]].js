// functions/post/[[path]].js
export async function onRequest(context) {
  const req = context.request;
  const url = new URL(req.url);

  // /post/xxx
  const parts = url.pathname.split("/").filter(Boolean);
  const isPostRoot = parts.length === 1 && parts[0] === "post";
  const isPostIndex = parts.length === 2 && parts[0] === "post" && parts[1] === "index.html";
  const pathId = (parts[0] === "post" && parts.length >= 2) ? parts[1] : "";

  // ✅ 关键：用 assets.local 拉静态页，避免触发 origin 上的重定向/规范化
  const target = new URL("https://assets.local/post/index.html");

  // 原样保留 query
  for (const [k, v] of url.searchParams.entries()) {
    target.searchParams.set(k, v);
  }

  // 兼容：如果只有 slug，没有 id，则补 id=slug
  if (target.searchParams.has("slug") && !target.searchParams.has("id")) {
    target.searchParams.set("id", target.searchParams.get("slug"));
  }

  // 兼容：/post/<xxx> 注入 id=<xxx>
  if (!isPostRoot && !isPostIndex && pathId && pathId !== "index.html") {
    target.searchParams.set("id", pathId);
  }

  // ✅ 不要把原 Request 直接复用（可能带上会触发平台行为的 header）
  const init = {
    method: req.method,
    headers: req.headers,
  };

  // 只有非 GET/HEAD 才需要 body（你的场景基本都是 GET）
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.body;
  }

  return context.env.ASSETS.fetch(new Request(target.toString(), init));
}
