export async function onRequest(context) {
  const url = new URL(context.request.url);

  // /post 或 /post/<slug> 都改写到 /post/index.html
  url.pathname = "/post/index.html";

  return fetch(new Request(url.toString(), context.request));
}
