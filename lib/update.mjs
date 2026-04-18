import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";

import { DATA_DIR, PROJECT_ROOT, UPDATE_STATE_FILE } from "./config.mjs";

const execFileAsync = promisify(execFile);

export const UPDATE_CHECK_CACHE_MS = 10 * 60 * 1000;
const UPDATE_MODES = new Set(["manual", "auto"]);

function nowIso() {
  return new Date().toISOString();
}

export function createDefaultUpdateState() {
  return {
    version: 1,
    mode: "manual",
    dismissedRemoteCommit: null,
    lastCheckedAt: null,
    lastActionAt: null,
    localCommit: null,
    remoteCommit: null,
    hasUpdate: false,
    dirtyWorktree: false,
    autoUpdatedAt: null,
    lastError: null
  };
}

export function normalizeUpdateState(raw) {
  const base = createDefaultUpdateState();
  const input = raw && typeof raw === "object" ? raw : {};
  const mode = typeof input.mode === "string" && UPDATE_MODES.has(input.mode) ? input.mode : base.mode;

  return {
    ...base,
    ...input,
    mode,
    dismissedRemoteCommit:
      typeof input.dismissedRemoteCommit === "string" && input.dismissedRemoteCommit ? input.dismissedRemoteCommit : null,
    lastCheckedAt: typeof input.lastCheckedAt === "string" && input.lastCheckedAt ? input.lastCheckedAt : null,
    lastActionAt: typeof input.lastActionAt === "string" && input.lastActionAt ? input.lastActionAt : null,
    localCommit: typeof input.localCommit === "string" && input.localCommit ? input.localCommit : null,
    remoteCommit: typeof input.remoteCommit === "string" && input.remoteCommit ? input.remoteCommit : null,
    hasUpdate: Boolean(input.hasUpdate),
    dirtyWorktree: Boolean(input.dirtyWorktree),
    autoUpdatedAt: typeof input.autoUpdatedAt === "string" && input.autoUpdatedAt ? input.autoUpdatedAt : null,
    lastError: typeof input.lastError === "string" && input.lastError ? input.lastError : null
  };
}

export function shouldShowUpdateBadge(state) {
  const normalized = normalizeUpdateState(state);
  return Boolean(
    normalized.hasUpdate &&
      normalized.remoteCommit &&
      normalized.remoteCommit !== normalized.dismissedRemoteCommit
  );
}

export function parseLsRemoteHeadOutput(raw) {
  const lines = String(raw ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const [commit, ref] = line.split(/\s+/);
    if (ref === "HEAD" && commit) {
      return commit;
    }
  }

  if (lines[0]) {
    const [commit] = lines[0].split(/\s+/);
    if (commit) {
      return commit;
    }
  }

  throw new Error("Unable to determine remote HEAD commit.");
}

export function buildUpdateViewModel(state) {
  const normalized = normalizeUpdateState(state);
  return {
    mode: normalized.mode,
    checkedAt: normalized.lastCheckedAt,
    lastActionAt: normalized.lastActionAt,
    localCommit: normalized.localCommit,
    remoteCommit: normalized.remoteCommit,
    hasUpdate: normalized.hasUpdate,
    showBadge: shouldShowUpdateBadge(normalized),
    dirtyWorktree: normalized.dirtyWorktree,
    autoUpdatedAt: normalized.autoUpdatedAt,
    lastError: normalized.lastError,
    dismissedRemoteCommit: normalized.dismissedRemoteCommit
  };
}

async function ensureUpdateStateFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(UPDATE_STATE_FILE);
  } catch {
    await fs.writeFile(UPDATE_STATE_FILE, `${JSON.stringify(createDefaultUpdateState(), null, 2)}\n`, "utf8");
  }
}

export async function readUpdateState() {
  await ensureUpdateStateFile();
  const raw = await fs.readFile(UPDATE_STATE_FILE, "utf8");
  return normalizeUpdateState(JSON.parse(raw));
}

async function saveUpdateState(state) {
  await ensureUpdateStateFile();
  const normalized = normalizeUpdateState(state);
  await fs.writeFile(UPDATE_STATE_FILE, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

async function runGit(args, { timeout = 10000 } = {}) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout,
    maxBuffer: 1024 * 1024
  });

  return (stdout ?? "").trim();
}

async function getLocalCommit() {
  return runGit(["rev-parse", "HEAD"]);
}

async function getRemoteCommit() {
  const raw = await runGit(["ls-remote", "origin", "HEAD"], { timeout: 15000 });
  return parseLsRemoteHeadOutput(raw);
}

async function getDirtyWorktree() {
  const raw = await runGit(["status", "--porcelain"]);
  return Boolean(raw);
}

async function pullFastForward() {
  return runGit(["pull", "--ff-only"], { timeout: 30000 });
}

export async function setUpdateMode(mode) {
  if (!UPDATE_MODES.has(mode)) {
    throw new Error(`Unsupported update mode: ${mode}`);
  }

  const state = await readUpdateState();
  state.mode = mode;
  state.lastActionAt = nowIso();

  if (mode === "auto") {
    state.dismissedRemoteCommit = null;
  }

  const saved = await saveUpdateState(state);
  return buildUpdateViewModel(saved);
}

export async function dismissCurrentUpdate(remoteCommit) {
  const state = await readUpdateState();
  state.mode = "manual";
  state.dismissedRemoteCommit =
    typeof remoteCommit === "string" && remoteCommit ? remoteCommit : state.remoteCommit ?? null;
  state.lastActionAt = nowIso();

  const saved = await saveUpdateState(state);
  return buildUpdateViewModel(saved);
}

export async function getUpdateStatus({ force = false, allowAutoUpdate = true } = {}) {
  const state = await readUpdateState();
  const checkedAtMs = state.lastCheckedAt ? Date.parse(state.lastCheckedAt) : 0;
  const isExpired = !checkedAtMs || Date.now() - checkedAtMs >= UPDATE_CHECK_CACHE_MS;
  const shouldRefresh =
    force ||
    isExpired ||
    !state.localCommit ||
    !state.remoteCommit ||
    (allowAutoUpdate && state.mode === "auto" && isExpired);

  if (!shouldRefresh) {
    return buildUpdateViewModel(state);
  }

  try {
    state.localCommit = await getLocalCommit();
    state.remoteCommit = await getRemoteCommit();
    state.dirtyWorktree = await getDirtyWorktree();
    state.hasUpdate = state.localCommit !== state.remoteCommit;
    state.lastCheckedAt = nowIso();
    state.lastError = null;

    if (allowAutoUpdate && state.mode === "auto" && state.hasUpdate) {
      if (state.dirtyWorktree) {
        state.lastError = "Auto update skipped because the local worktree is not clean.";
      } else {
        try {
          await pullFastForward();
          state.localCommit = await getLocalCommit();
          state.hasUpdate = state.localCommit !== state.remoteCommit;
          state.autoUpdatedAt = nowIso();
          state.lastActionAt = state.autoUpdatedAt;

          if (!state.hasUpdate) {
            state.dismissedRemoteCommit = null;
          }
        } catch (error) {
          state.lastError = error instanceof Error ? error.message : String(error);
        }
      }
    }
  } catch (error) {
    state.lastCheckedAt = nowIso();
    state.lastError = error instanceof Error ? error.message : String(error);
  }

  const saved = await saveUpdateState(state);
  return buildUpdateViewModel(saved);
}
