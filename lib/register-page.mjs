import { promises as fs } from "node:fs";
import path from "node:path";

import {
  backupEntryHtml,
  findUser,
  loadRegistry,
  makeBackupPaths,
  removePageFromRegistry,
  saveRegistry,
  slugify,
  toPosixPath
} from "./registry.mjs";

const GENERIC_USER_IDENTITIES = new Set(["codex", "agent", "assistant", "default", "test"]);
const COMMON_WORKSPACE_OUTPUT_DIRS = new Set([
  "artifacts",
  "build",
  "dist",
  "docs",
  "html",
  "out",
  "output",
  "pages",
  "plan",
  "portal",
  "public",
  "reports",
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
const SECOND_LEVEL_IDENTITY_CONTAINERS = new Set([
  "agents",
  "agent-space",
  "agentspace",
  "agentspace",
  "subprojects",
  "subproject",
  "workspace",
  "workspaces"
]);
const MAX_USER_IDENTITY_SEGMENTS = 2;

function pick(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function createStatusError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
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

function splitIdentitySegments(value) {
  return String(value ?? "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function displayNameFromSegments(segments) {
  return segments.join(" / ");
}

function identityFromSegments(segments, { derived, source }) {
  return {
    userId: segments.map((segment) => slugify(segment)).join("/"),
    userDisplayName: displayNameFromSegments(segments),
    derived,
    source,
    segments: [...segments]
  };
}

function parseExplicitIdentity(value, sourceLabel) {
  if (!value) {
    return null;
  }

  const segments = splitIdentitySegments(value);
  if (segments.length === 0) {
    return null;
  }

  if (segments.length > MAX_USER_IDENTITY_SEGMENTS) {
    throw createStatusError(400, `User identity supports at most ${MAX_USER_IDENTITY_SEGMENTS} levels. Received: ${value}`);
  }

  if (segments.some((segment) => isGenericUserIdentity(segment))) {
    return null;
  }

  return {
    source: sourceLabel,
    raw: value,
    segments,
    slugSegments: segments.map((segment) => slugify(segment))
  };
}

function sameIdentitySegments(left, right) {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

function deriveWorkspaceFallback(startPath) {
  let fallback = path.resolve(startPath);

  while (true) {
    const parent = path.dirname(fallback);
    if (parent === fallback || !COMMON_WORKSPACE_OUTPUT_DIRS.has(path.basename(fallback).toLowerCase())) {
      return fallback;
    }

    fallback = parent;
  }
}

export async function inferWorkspaceRoot(startPath) {
  let current = path.resolve(startPath);
  const fallback = deriveWorkspaceFallback(current);

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

export async function deriveWorkspaceIdentity(startPath) {
  const candidatePath = path.resolve(startPath);
  const projectRoot = await inferWorkspaceRoot(candidatePath);
  const rootName = path.basename(projectRoot);
  const relativeSegments = path
    .relative(projectRoot, candidatePath)
    .split(path.sep)
    .filter(Boolean);
  const firstSegment = relativeSegments[0]?.toLowerCase();
  const secondLevelName =
    relativeSegments.length >= 2 && SECOND_LEVEL_IDENTITY_CONTAINERS.has(firstSegment)
      ? relativeSegments[1]
      : null;

  return {
    projectRoot,
    rootName,
    secondLevelName,
    relativeSegments,
    truncated: Boolean(secondLevelName && relativeSegments.length > 2),
    rootIdentity: identityFromSegments([rootName], { derived: true, source: "workspace-root" }),
    fullIdentity: secondLevelName
      ? identityFromSegments([rootName, secondLevelName], { derived: true, source: "workspace-second-level" })
      : null
  };
}

export function resolveUserIdentity(inputUser, workspaceIdentity) {
  const explicitUserId = pick(inputUser?.id);
  const explicitUserName = pick(inputUser?.name);
  const parsedUserId = parseExplicitIdentity(explicitUserId, "id");
  const parsedUserName = parseExplicitIdentity(explicitUserName, "name");
  const rootIdentity = workspaceIdentity.rootIdentity;
  const fullIdentity = workspaceIdentity.fullIdentity;
  const fullSlugSegments = fullIdentity ? fullIdentity.userId.split("/") : null;
  const rootSlugSegments = rootIdentity.userId.split("/");
  const secondLevelSlugSegment = fullSlugSegments?.[1] ?? null;

  function explicitIdentityFromParsed(parsed, fallbackDisplaySegments = parsed?.segments) {
    return {
      userId: parsed.slugSegments.join("/"),
      userDisplayName: displayNameFromSegments(fallbackDisplaySegments),
      derived: false,
      source: parsed.source
    };
  }

  function expandLeafIdentity(parsed) {
    if (!fullIdentity || parsed.slugSegments.length !== 1 || parsed.slugSegments[0] !== secondLevelSlugSegment) {
      return null;
    }

    return {
      userId: fullIdentity.userId,
      userDisplayName: fullIdentity.userDisplayName,
      derived: false,
      source: `${parsed.source}-leaf-expanded`
    };
  }

  if (parsedUserId) {
    const expanded = expandLeafIdentity(parsedUserId);
    if (expanded) {
      return expanded;
    }

    if (sameIdentitySegments(parsedUserId.slugSegments, rootSlugSegments)) {
      return {
        userId: rootIdentity.userId,
        userDisplayName:
          parsedUserName && sameIdentitySegments(parsedUserName.slugSegments, rootSlugSegments)
            ? displayNameFromSegments(parsedUserName.segments)
            : rootIdentity.userDisplayName,
        derived: false,
        source: "id-root"
      };
    }

    if (fullSlugSegments && sameIdentitySegments(parsedUserId.slugSegments, fullSlugSegments)) {
      return {
        userId: fullIdentity.userId,
        userDisplayName:
          parsedUserName && sameIdentitySegments(parsedUserName.slugSegments, fullSlugSegments)
            ? displayNameFromSegments(parsedUserName.segments)
            : fullIdentity.userDisplayName,
        derived: false,
        source: "id-full"
      };
    }

    const fallbackDisplaySegments =
      parsedUserName && parsedUserName.slugSegments.length === parsedUserId.slugSegments.length
        ? parsedUserName.segments
        : parsedUserId.segments;

    return explicitIdentityFromParsed(parsedUserId, fallbackDisplaySegments);
  }

  if (parsedUserName) {
    const expanded = expandLeafIdentity(parsedUserName);
    if (expanded) {
      return expanded;
    }

    if (sameIdentitySegments(parsedUserName.slugSegments, rootSlugSegments)) {
      return {
        userId: rootIdentity.userId,
        userDisplayName: displayNameFromSegments(parsedUserName.segments),
        derived: false,
        source: "name-root"
      };
    }

    if (fullSlugSegments && sameIdentitySegments(parsedUserName.slugSegments, fullSlugSegments)) {
      return {
        userId: fullIdentity.userId,
        userDisplayName: displayNameFromSegments(parsedUserName.segments),
        derived: false,
        source: "name-full"
      };
    }

    return explicitIdentityFromParsed(parsedUserName);
  }

  return fullIdentity ?? rootIdentity;
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
  const identityStartPath = path.resolve(input.workspaceRoot ?? sourceRoot);
  const workspaceIdentity = await deriveWorkspaceIdentity(identityStartPath);
  const { userId, userDisplayName } = resolveUserIdentity(input.user, workspaceIdentity);

  if (!relativeEntry || relativeEntry.startsWith("..") || path.isAbsolute(relativeEntry)) {
    throw new Error("Entry file must live inside source root.");
  }

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

export async function unregisterPage(rawInput = {}) {
  const input = createRegisterPayload(rawInput);
  const userId = pick(rawInput.userId, rawInput["user-id"], input.user.id);
  const pageId = pick(rawInput.pageId, rawInput["page-id"], input.page.id);

  if (!userId || !pageId) {
    throw createStatusError(400, "Deletion requires userId and pageId.");
  }

  const registry = await loadRegistry();
  const removed = removePageFromRegistry(registry, String(userId), String(pageId));

  if (!removed) {
    throw createStatusError(404, `Unknown page: ${userId}/${pageId}`);
  }

  await saveRegistry(registry);

  const backupPaths = makeBackupPaths(String(userId), String(pageId));
  let warning = null;

  try {
    await fs.rm(backupPaths.absoluteDir, { recursive: true, force: true });
  } catch (error) {
    warning = error instanceof Error ? error.message : String(error);
  }

  return {
    user: removed.user,
    page: {
      id: removed.page.id,
      title: removed.page.title,
      description: removed.page.description ?? ""
    },
    removedUser: removed.removedUser,
    nextRoute: removed.nextPage
      ? `/users/${encodeURIComponent(removed.user.id)}/pages/${encodeURIComponent(removed.nextPage.id)}`
      : "/",
    warning
  };
}
