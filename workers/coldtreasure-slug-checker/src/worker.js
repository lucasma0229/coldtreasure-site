const NOTION_VERSION = "2025-09-03";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "coldtreasure-slug-checker",
      });
    }

    if (url.pathname === "/run") {
      try {
        const result = await processPendingChecks(env);
        return json(result);
      } catch (error) {
        console.error(error);
        return json(
          {
            ok: false,
            error: String(error?.message || error),
          },
          500
        );
      }
    }

    return json({
      ok: true,
      message: "ColdTreasure slug checker is running.",
    });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      processPendingChecks(env).catch((error) => {
        console.error("Scheduled slug check failed:", error);
      })
    );
  },
};

async function processPendingChecks(env) {
  const pages = await getPendingPages(env);

  if (!pages.length) {
    return {
      ok: true,
      checked: 0,
      message: "No pending checks.",
    };
  }

  let passed = 0;
  let duplicated = 0;
  let invalid = 0;
  let failed = 0;

  for (const page of pages) {
    try {
      const pageId = page.id;
      const title = getTitle(page);
      const slug = getPlainText(page, "slug").trim();

      if (!isValidSlug(slug)) {
        await updateNotionResult(env, pageId, {
          result: "网址无效",
          explanation:
            "slug 只能使用小写英文字母、数字和连字符，且不能以连字符开头或结尾。",
          checkedSlug: slug,
          clearRequest: true,
        });

        invalid++;
        continue;
      }

      const duplicate = await env.SLUG_DB.prepare(
        `
        SELECT notion_page_id, slug, title
        FROM slug_registry
        WHERE slug = ?
          AND notion_page_id != ?
          AND status = 'active'
        LIMIT 1
        `
      )
        .bind(slug, pageId)
        .first();

      if (duplicate) {
        await updateNotionResult(env, pageId, {
          result: "网址重复",
          explanation: `该网址已被占用：${duplicate.title || duplicate.slug}`,
          checkedSlug: slug,
          clearRequest: true,
        });

        duplicated++;
        continue;
      }

      await env.SLUG_DB.prepare(
        `
        INSERT INTO slug_registry
          (notion_page_id, slug, title, status, updated_at)
        VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)
        ON CONFLICT(notion_page_id)
        DO UPDATE SET
          slug = excluded.slug,
          title = excluded.title,
          status = 'active',
          updated_at = CURRENT_TIMESTAMP
        `
      )
        .bind(pageId, slug, title)
        .run();

      await updateNotionResult(env, pageId, {
        result: "检查通过",
        explanation: "网址可用，未发现重复。",
        checkedSlug: slug,
        clearRequest: true,
      });

      passed++;
    } catch (error) {
      console.error("Page check failed:", page?.id, error);

      failed++;

      try {
        await updateNotionResult(env, page.id, {
          result: "检查失败",
          explanation: `检查失败：${String(error?.message || error).slice(
            0,
            500
          )}`,
          checkedSlug: getPlainText(page, "slug").trim(),
          clearRequest: false,
        });
      } catch (updateError) {
        console.error("Failed to write error back to Notion:", updateError);
      }
    }
  }

  return {
    ok: true,
    checked: pages.length,
    passed,
    duplicated,
    invalid,
    failed,
  };
}

async function getPendingPages(env) {
  const response = await notionFetch(
    env,
    `/v1/data_sources/${env.NOTION_DATA_SOURCE_ID}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: {
          property: "请求检查",
          checkbox: {
            equals: true,
          },
        },
        page_size: 20,
      }),
    }
  );

  return response.results || [];
}

async function updateNotionResult(
  env,
  pageId,
  { result, explanation, checkedSlug, clearRequest }
) {
  const properties = {
    查重结果: {
      select: {
        name: result,
      },
    },

    检查说明: {
      rich_text: [
        {
          type: "text",
          text: {
            content: explanation || "",
          },
        },
      ],
    },

    "上次检查的 slug": {
      rich_text: checkedSlug
        ? [
            {
              type: "text",
              text: {
                content: checkedSlug,
              },
            },
          ]
        : [],
    },

    检查时间: {
      date: {
        start: new Date().toISOString(),
      },
    },
  };

  if (clearRequest) {
    properties["请求检查"] = {
      checkbox: false,
    };
  }

  await notionFetch(env, `/v1/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties,
    }),
  });
}

async function notionFetch(env, path, options = {}) {
  const response = await fetch(`https://api.notion.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.NOTION_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(
      `Notion API ${response.status}: ${
        data?.message || data?.raw || "Unknown error"
      }`
    );
  }

  return data;
}

function getPlainText(page, propertyName) {
  const property = page?.properties?.[propertyName];

  if (!property) return "";

  if (property.type === "rich_text") {
    return (property.rich_text || [])
      .map((item) => item.plain_text || "")
      .join("");
  }

  if (property.type === "title") {
    return (property.title || [])
      .map((item) => item.plain_text || "")
      .join("");
  }

  return "";
}

function getTitle(page) {
  return getPlainText(page, "标题") || "Untitled";
}

function isValidSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

