import { promises as fs } from "node:fs";

import { LOG_FILE, PID_FILE, RUNTIME_DIR } from "./config.mjs";

export async function ensureRuntimeDir() {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
}

export async function readDaemonState() {
  try {
    const raw = await fs.readFile(PID_FILE, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || typeof parsed.pid !== "number") {
      return null;
    }

    return parsed;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && error.code === "ESRCH") {
      return false;
    }

    if (error && error.code === "EPERM") {
      return true;
    }

    throw error;
  }
}

export async function writeDaemonState(state) {
  await ensureRuntimeDir();
  await fs.writeFile(PID_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function removeDaemonState() {
  try {
    await fs.unlink(PID_FILE);
  } catch (error) {
    if (!error || error.code !== "ENOENT") {
      throw error;
    }
  }
}

export async function readRecentLog(maxBytes = 4000) {
  try {
    const stat = await fs.stat(LOG_FILE);
    const start = Math.max(0, stat.size - maxBytes);
    const handle = await fs.open(LOG_FILE, "r");

    try {
      const buffer = Buffer.alloc(stat.size - start);
      await handle.read(buffer, 0, buffer.length, start);
      return buffer.toString("utf8");
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}
