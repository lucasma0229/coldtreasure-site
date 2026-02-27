export async function onRequest(context) {
  const NOTION_KEY = context.env.NOTION_KEY;
  const DATABASE_ID = context.env.NOTION_DATABASE_ID;

  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_KEY}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        filter: { property: "publish", checkbox: { equals: true } },
        // 这里的 property 名必须和 Notion 数据库里的属性名完全一致（区分大小写）
        sorts: [{ property: "date", direction: "descending" }],
        page_size: 100,
      }),
    });

    const data = await res.json();

    // Notion 报错就原样吐出来，避免 1101
    if (!res.ok) {
      return json(
        { error: "Notion API error", detail: data },
        500,
        // Notion 报错也别缓存
        "no-store"
      );
    }

    // ---- helpers ----
    const joinRichText = (arr) =>
      Array.isArray(arr) ? arr.map((x) => x?.plain_text ?? "").join("") : "";

    const getText = (prop) => {
      if (!prop) return "";
      if (prop.type === "title") return joinRichText(prop.title);
      if (prop.type === "rich_text") return joinRichText(prop.rich_text);
      return "";
    };

    const getSelect = (prop) => (prop?.type === "select" ? prop.select?.name ?? "" : "");

    const getMultiSelect = (prop) =>
      prop?.type === "multi_select" ? (prop.multi_select || []).map((x) => x.name).filter(Boolean) : [];

    const getDate = (prop) => (prop?.type === "date" ? prop.date?.start ?? "" : "");

    const getFiles = (prop) => {
      // Notion files: [{name,type,file:{url}}] or external:{url}
      if (!prop || prop.type !== "files") return [];
      return (prop.files || []).map((f) => ({
        name: f?.name ?? "",
        url: f?.file?.url ?? f?.external?.url ?? "",
        type: f?.type ?? "",
      })).filter((x) => x.url);
    };

    const getFirstFileUrl = (prop) => getFiles(prop)?.[0]?.url ?? "";

    // ---- map posts ----
    const posts = (data.results || []).map((p) => {
      const props = p.properties || {};

      const title = getText(props.title).trim();
      const slug = getText(props.slug).trim();     // ✅ 修 slug（去掉空格/换行）
      const content = getText(props.content);      // ✅ 拼接所有 rich_text 段
      const date = getDate(props.date);

      const cover = getFirstFileUrl(props.cover);  // ⚠️ file.url 可能过期
      const gallery = getFiles(props.gallery);     // 输出图集（可选）
      const keywords = getMultiSelect(props.keywords);

      return {
        id: p.id,
        title,
        slug,
        cover,
        gallery,     // 如果你暂时不需要，可以删掉
        date,
        keywords,    // ✅ multi_select -> string[]
        // 你如果还有 brand / 栏目 / 标签，也可以继续加：
        // brand: getSelect(props.brand),
        // section: getSelect(props.section),
        // tag: getSelect(props.tag),
        content,
      };
    });

    /**
     * 关键点：因为 cover 可能是 Notion 的临时签名链接，
     * 这里默认不要缓存，否则会缓存到过期 URL。
     * 如果你后续把 cover 全部换成永久外链（external.url），可以把 no-store 改成短缓存/长缓存。
     */
    return json(posts, 200, "no-store");
  } catch (err) {
    return json({ error: String(err?.stack || err) }, 500, "no-store");
  }
}

function json(payload, status = 200, cacheControl = "no-store") {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
    },
  });
}
