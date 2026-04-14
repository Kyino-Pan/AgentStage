import { promises as fs } from "node:fs";
import path from "node:path";

import { BACKUP_DIR, DATA_DIR, PROJECT_ROOT, PROJECT_ROOT_TOKEN, REGISTRY_FILE } from "./config.mjs";

function nowIso() {
  return new Date().toISOString();
}

export function emptyRegistry() {
  return {
    version: 1,
    updatedAt: nowIso(),
    users: []
  };
}

export async function ensureRegistryFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(BACKUP_DIR, { recursive: true });

  try {
    await fs.access(REGISTRY_FILE);
  } catch {
    await fs.writeFile(REGISTRY_FILE, `${JSON.stringify(emptyRegistry(), null, 2)}\n`, "utf8");
  }
}

export async function loadRegistry() {
  await ensureRegistryFile();
  const raw = await fs.readFile(REGISTRY_FILE, "utf8");
  const parsed = JSON.parse(raw);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Registry file is malformed.");
  }

  if (!Array.isArray(parsed.users)) {
    parsed.users = [];
  }

  parsed.version ??= 1;
  parsed.updatedAt ??= nowIso();

  for (const user of parsed.users) {
    user.pages = Array.isArray(user.pages) ? user.pages : [];
    user.name ??= user.id;
    user.description ??= "";

    for (const page of user.pages) {
      if (typeof page.sourceRoot === "string") {
        page.sourceRoot = resolveProjectAwarePath(page.sourceRoot);
      }
    }
  }

  return parsed;
}

export async function saveRegistry(registry) {
  registry.updatedAt = nowIso();
  registry.users.sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"));

  for (const user of registry.users) {
    user.pages.sort((left, right) => left.title.localeCompare(right.title, "zh-Hans-CN"));
  }

  await fs.writeFile(REGISTRY_FILE, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

export function slugify(input) {
  const base = String(input ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return base || "page";
}

export function toPosixPath(input) {
  return input.split(path.sep).join(path.posix.sep);
}

export function resolveProjectAwarePath(input) {
  if (typeof input !== "string" || !input.startsWith(PROJECT_ROOT_TOKEN)) {
    return input;
  }

  const suffix = input.slice(PROJECT_ROOT_TOKEN.length).replace(/^[/\\]+/, "");
  return path.join(PROJECT_ROOT, suffix);
}

export function findUser(registry, userId) {
  return registry.users.find((user) => user.id === userId) ?? null;
}

export function findPage(registry, userId, pageId) {
  const user = findUser(registry, userId);
  if (!user) {
    return null;
  }

  const page = user.pages.find((item) => item.id === pageId) ?? null;
  if (!page) {
    return null;
  }

  return { user, page };
}

export function makeBackupPaths(userId, pageId) {
  const relativeDir = path.join("backups", userId, pageId);
  return {
    relativeDir,
    relativeLatestHtml: path.join(relativeDir, "entry.latest.html"),
    relativeVersionsDir: path.join(relativeDir, "versions"),
    absoluteDir: path.join(BACKUP_DIR, userId, pageId),
    absoluteLatestHtml: path.join(BACKUP_DIR, userId, pageId, "entry.latest.html"),
    absoluteVersionsDir: path.join(BACKUP_DIR, userId, pageId, "versions")
  };
}

export async function backupEntryHtml({ userId, pageId, entryHtmlPath }) {
  const backups = makeBackupPaths(userId, pageId);
  const html = await fs.readFile(entryHtmlPath, "utf8");
  const stamp = nowIso().replace(/[:]/g, "-");
  const versionFile = path.join(backups.absoluteVersionsDir, `${stamp}.html`);

  await fs.mkdir(backups.absoluteVersionsDir, { recursive: true });
  await fs.writeFile(backups.absoluteLatestHtml, html, "utf8");
  await fs.writeFile(versionFile, html, "utf8");

  return {
    latestRelativePath: backups.relativeLatestHtml,
    versionRelativePath: path.join(backups.relativeVersionsDir, `${stamp}.html`)
  };
}
