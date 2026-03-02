// /functions/post/[[path]].js
export async function onRequest({ request, env }) {
  const url = new URL(request.url);

  // ✅ 1) 放行真实文件，避免函数对 /post/index.html 再次介入导致递归/1019
  if (url.pathname === "/post/index.html") {
    return env.ASSETS.fetch(request);
  }

  // ✅ 2) /post 与 /post/<slug> 都内部改写到 /post/index.html（地址栏不变）
  // 注意：这里包含 /post/xxx、/post/xxx/、以及你未来可能加的层级
  if (url.pathname === "/post" || url.pathname.startsWith("/post/")) {
    const rewrite = new URL(request.url);
    rewrite.pathname = "/post/index.html";

    // 关键点：用 env.ASSETS.fetch 读取静态资源，而不是 fetch()，避免再次触发 Functions
    return env.ASSETS.fetch(new Request(rewrite.toString(), request));
  }

  // ✅ 3) 兜底：不在 /post 范围内的请求，交给静态资源
  return env.ASSETS.fetch(request);
}
