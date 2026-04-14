import { promises as fs } from "node:fs";
import path from "node:path";

import { backupEntryHtml, findUser, loadRegistry, saveRegistry, slugify, toPosixPath } from "./registry.mjs";

const GENERIC_USER_IDENTITIES = new Set(["codex", "agent", "assistant", "default", "test"]);
const COMMON_WORKSPACE_OUTPUT_DIRS = new Set([
  "build",
  "dist",
  "docs",
  "html",
  "out",
  "output",
  "public",
  "site",
  "static",
  "www"
]);
const WORKSPACE_MARKERS = [
  ".git",
  ".planning",
  "package.json",
  "pnpm-workspace.yaml",
  "yarn.lock",
  "package-lock.json",
  "bun.lock",
  "bun.lockb",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "Cargo.toml"
];

function pick(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function normalizeNamedEntity(value, fallbackKey) {
  if (typeof value === "string") {
    return { [fallbackKey]: value };
  }

  if (value && typeof value === "object") {
    return value;
  }

  return {};
}

export async function loadManifestFile(manifestPath) {
  if (!manifestPath) {
    return {};
  }

  const absoluteManifestPath = path.resolve(manifestPath);
  const raw = await fs.readFile(absoluteManifestPath, "utf8");
  const parsed = JSON.parse(raw);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Manifest must be a JSON object.");
  }

  return parsed;
}

export function createRegisterPayload(input = {}) {
  const user = normalizeNamedEntity(input.user, "name");
  const page = normalizeNamedEntity(input.page, "title");

  return {
    user: {
      id: pick(input.userId, user.id),
      name: pick(input.userName, input.userDisplayName, user.name),
      description: pick(input.userDescription, user.description, "")
    },
    page: {
      id: pick(input.pageId, page.id),
      title: pick(input.pageTitle, input.title, page.title),
      description: pick(input.pageDescription, input.description, page.description, "")
    },
    workspaceRoot: pick(input.workspaceRoot, input["workspace-root"]),
    sourceRoot: pick(input.sourceRoot, input["source-root"], page.sourceRoot),
    entry: pick(input.entry, page.entry)
  };
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isGenericUserIdentity(value) {
  return GENERIC_USER_IDENTITIES.has(String(value ?? "").trim().toLowerCase());
}

async function inferWorkspaceRoot(startPath) {
  let current = path.resolve(startPath);
  let fallback = current;

  if (COMMON_WORKSPACE_OUTPUT_DIRS.has(path.basename(current).toLowerCase())) {
    fallback = path.dirname(current);
  }

  while (true) {
    for (const marker of WORKSPACE_MARKERS) {
      if (await pathExists(path.join(current, marker))) {
        return current;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return fallback;
    }

    current = parent;
  }
}

export async function registerPage(rawInput) {
  const input = createRegisterPayload(rawInput);
  const pageTitle = input.page.title;
  const entryInput = input.entry;

  if (!pageTitle || !entryInput) {
    throw new Error("Registration requires page title and entry HTML path.");
  }

  const entryHtmlPath = path.resolve(entryInput);
  const entryStats = await fs.stat(entryHtmlPath);
  if (!entryStats.isFile()) {
    throw new Error(`Entry is not a file: ${entryHtmlPath}`);
  }

  const sourceRoot = path.resolve(input.sourceRoot ?? path.dirname(entryHtmlPath));
  const relativeEntry = path.relative(sourceRoot, entryHtmlPath);
  const workspaceRoot = path.resolve(input.workspaceRoot ?? (await inferWorkspaceRoot(sourceRoot)));
  const workspaceFolderName = path.basename(workspaceRoot);
  const shouldDeriveUserIdentity =
    !input.user.name ||
    !input.user.id ||
    isGenericUserIdentity(input.user.name) ||
    isGenericUserIdentity(input.user.id);
  const userDisplayName = shouldDeriveUserIdentity ? workspaceFolderName : input.user.name;

  if (!relativeEntry || relativeEntry.startsWith("..") || path.isAbsolute(relativeEntry)) {
    throw new Error("Entry file must live inside source root.");
  }

  const userId = shouldDeriveUserIdentity ? slugify(workspaceFolderName) : pick(input.user.id, slugify(userDisplayName));
  const pageId = pick(input.page.id, slugify(pageTitle));
  const now = new Date().toISOString();

  const registry = await loadRegistry();
  let user = findUser(registry, userId);

  if (!user) {
    user = {
      id: userId,
      name: userDisplayName,
      description: input.user.description ?? "",
      pages: []
    };
    registry.users.push(user);
  } else {
    user.name = userDisplayName;
    user.description = input.user.description ?? user.description ?? "";
  }

  const backup = await backupEntryHtml({ userId, pageId, entryHtmlPath });
  const existingPageIndex = user.pages.findIndex((page) => page.id === pageId);
  const previousPage = existingPageIndex >= 0 ? user.pages[existingPageIndex] : null;

  const pageRecord = {
    id: pageId,
    title: pageTitle,
    description: input.page.description ?? "",
    sourceRoot,
    entryPath: toPosixPath(relativeEntry),
    backupHtmlPath: toPosixPath(backup.latestRelativePath),
    createdAt: previousPage?.createdAt ?? now,
    updatedAt: now
  };

  if (existingPageIndex >= 0) {
    user.pages.splice(existingPageIndex, 1, pageRecord);
  } else {
    user.pages.push(pageRecord);
  }

  await saveRegistry(registry);

  return {
    user: {
      id: userId,
      name: userDisplayName,
      description: user.description ?? ""
    },
    page: pageRecord,
    route: `/users/${encodeURIComponent(userId)}/pages/${encodeURIComponent(pageId)}`,
    liveUrl: `/source/${encodeURIComponent(userId)}/${encodeURIComponent(pageId)}/${encodeURI(pageRecord.entryPath)}`,
    backupUrl: `/${pageRecord.backupHtmlPath}`,
    updatedAt: now
  };
}
