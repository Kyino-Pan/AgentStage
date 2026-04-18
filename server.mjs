import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_HOST, DEFAULT_PORT, PROJECT_ROOT, PUBLIC_DIR } from "./lib/config.mjs";
import { registerPage, unregisterPage } from "./lib/register-page.mjs";
import { ensureRegistryFile, findPage, loadRegistry, toPosixPath } from "./lib/registry.mjs";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendText(response, statusCode, text, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  response.end(text);
}

function statusCodeForError(error) {
  return error && typeof error === "object" && Number.isInteger(error.statusCode) ? error.statusCode : 500;
}

async function readJsonBody(request) {
  let rawBody = "";

  for await (const chunk of request) {
    rawBody += chunk;

    if (rawBody.length > 1024 * 1024) {
      throw new Error("Request body is too large.");
    }
  }

  if (!rawBody.trim()) {
    return {};
  }

  return JSON.parse(rawBody);
}

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function isWithinRoot(root, candidate) {
  const normalizedRoot = path.resolve(root);
  const normalizedCandidate = path.resolve(candidate);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

async function readFileIfExists(filePath) {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function buildViewModel(registry) {
  return {
    updatedAt: registry.updatedAt,
    users: registry.users.map((user) => ({
      id: user.id,
      name: user.name,
      description: user.description,
      pageCount: user.pages.length,
      route: `/users/${encodeURIComponent(user.id)}`,
      pages: user.pages.map((page) => ({
        id: page.id,
        title: page.title,
        description: page.description,
        route: `/users/${encodeURIComponent(user.id)}/pages/${encodeURIComponent(page.id)}`,
        liveUrl: `/source/${encodeURIComponent(user.id)}/${encodeURIComponent(page.id)}/${encodeURI(page.entryPath)}`,
        backupUrl: page.backupHtmlPath ? `/${toPosixPath(page.backupHtmlPath)}` : null,
        sourceRoot: page.sourceRoot,
        entryPath: page.entryPath,
        updatedAt: page.updatedAt,
        createdAt: page.createdAt
      }))
    }))
  };
}

function injectBaseHref(html, mountPrefix) {
  const baseTag = `<base href="${mountPrefix}">`;

  if (/<base\s/i.test(html)) {
    return html.replace(/<base\s+href=(["'])(.*?)\1/i, `<base href="${mountPrefix}">`);
  }

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>\n    ${baseTag}`);
  }

  return `${baseTag}\n${html}`;
}

function rewriteRootAbsoluteRefs(html, mountPrefix) {
  const attributePattern = /\b(src|href|action|poster)=("|')\/(?!\/)([^"']*)\2/gi;
  const cssUrlPattern = /url\((["']?)\/(?!\/)([^"')]+)\1\)/gi;
  const metaContentPattern = /\bcontent=("|')\/(?!\/)([^"']*)\1/gi;

  const rewrittenAttributes = html.replace(attributePattern, (_, attr, quote, assetPath) => {
    return `${attr}=${quote}${mountPrefix}${assetPath}${quote}`;
  });

  const rewrittenCss = rewrittenAttributes.replace(cssUrlPattern, (_, quote, assetPath) => {
    return `url(${quote}${mountPrefix}${assetPath}${quote})`;
  });

  return rewrittenCss.replace(metaContentPattern, (_, quote, assetPath) => {
    return `content=${quote}${mountPrefix}${assetPath}${quote}`;
  });
}

async function serveFile(response, filePath, requestPathname) {
  const file = await readFileIfExists(filePath);

  if (!file) {
    sendText(response, 404, `Not found: ${requestPathname}`);
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypeFor(filePath),
    "Cache-Control": "no-store"
  });
  response.end(file);
}

async function serveMountedSource(response, requestUrl) {
  const registry = await loadRegistry();
  const matches = requestUrl.pathname.match(/^\/source\/([^/]+)\/([^/]+)(?:\/(.*))?$/);

  if (!matches) {
    sendText(response, 404, "Malformed source URL.");
    return;
  }

  const [, rawUserId, rawPageId, rawRest] = matches;
  const userId = decodeURIComponent(rawUserId);
  const pageId = decodeURIComponent(rawPageId);
  const located = findPage(registry, userId, pageId);

  if (!located) {
    sendText(response, 404, "Unknown page.");
    return;
  }

  const requestRelativePath = rawRest ? decodeURIComponent(rawRest) : located.page.entryPath;
  const targetFile = path.resolve(located.page.sourceRoot, requestRelativePath);

  if (!isWithinRoot(located.page.sourceRoot, targetFile)) {
    sendText(response, 403, "Blocked path traversal.");
    return;
  }

  const file = await readFileIfExists(targetFile);

  if (!file) {
    if (requestRelativePath === located.page.entryPath && located.page.backupHtmlPath) {
      const backupFilePath = path.join(PROJECT_ROOT, located.page.backupHtmlPath);
      const backup = await readFileIfExists(backupFilePath);

      if (backup) {
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Agent-Stage-Source": "backup"
        });
        response.end(backup);
        return;
      }
    }

    sendText(response, 404, `Missing source file: ${requestRelativePath}`);
    return;
  }

  const extension = path.extname(targetFile).toLowerCase();
  if (extension === ".html" || extension === ".htm") {
    const mountPrefix = `/source/${encodeURIComponent(userId)}/${encodeURIComponent(pageId)}/`;
    let html = file.toString("utf8");
    html = rewriteRootAbsoluteRefs(html, mountPrefix);
    html = injectBaseHref(html, mountPrefix);

    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Agent-Stage-Source": "live"
    });
    response.end(html);
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypeFor(targetFile),
    "Cache-Control": "no-store",
    "X-Agent-Stage-Source": "live"
  });
  response.end(file);
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendText(response, 400, "Request URL is missing.");
    return;
  }

  try {
    const requestUrl = new URL(request.url, "http://localhost");

    if (request.method === "GET" && requestUrl.pathname === "/healthz") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/registry") {
      const registry = await loadRegistry();
      sendJson(response, 200, buildViewModel(registry));
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/register") {
      const payload = await readJsonBody(request);
      const result = await registerPage(payload);
      sendJson(response, 201, result);
      return;
    }

    const deleteMatches = requestUrl.pathname.match(/^\/api\/users\/([^/]+)\/pages\/([^/]+)$/);
    if (request.method === "DELETE" && deleteMatches) {
      const [, rawUserId, rawPageId] = deleteMatches;
      const result = await unregisterPage({
        userId: decodeURIComponent(rawUserId),
        pageId: decodeURIComponent(rawPageId)
      });
      sendJson(response, 200, result);
      return;
    }

    if (requestUrl.pathname.startsWith("/source/")) {
      await serveMountedSource(response, requestUrl);
      return;
    }

    const publicCandidate = path.join(PUBLIC_DIR, requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1));
    if (isWithinRoot(PUBLIC_DIR, publicCandidate)) {
      const publicAsset = await readFileIfExists(publicCandidate);
      if (publicAsset) {
        response.writeHead(200, {
          "Content-Type": contentTypeFor(publicCandidate),
          "Cache-Control": "no-store"
        });
        response.end(publicAsset);
        return;
      }
    }

    const backupCandidate = path.join(PROJECT_ROOT, requestUrl.pathname.slice(1));
    if (requestUrl.pathname.startsWith("/backups/") && isWithinRoot(PROJECT_ROOT, backupCandidate)) {
      await serveFile(response, backupCandidate, requestUrl.pathname);
      return;
    }

    await serveFile(response, path.join(PUBLIC_DIR, "index.html"), requestUrl.pathname);
  } catch (error) {
    const statusCode = statusCodeForError(error);
    sendJson(response, statusCode, {
      error: statusCode === 500 ? "Internal server error" : "Request failed",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

await ensureRegistryFile();

const port = Number(process.env.PORT ?? DEFAULT_PORT);
const host = process.env.HOST ?? DEFAULT_HOST;

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down AgentStage.`);
  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 5000).unref();
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

server.listen(port, host, () => {
  const displayRoot = fileURLToPath(new URL(".", import.meta.url));
  console.log(`AgentStage running on http://${host}:${port}`);
  console.log(`Project root: ${displayRoot}`);
});
