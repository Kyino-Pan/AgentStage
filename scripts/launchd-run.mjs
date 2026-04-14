import { LOG_FILE } from "../lib/config.mjs";
import { ensureRuntimeDir, writeDaemonState } from "../lib/runtime.mjs";
import { getHost, getPort } from "./launchd-lib.mjs";

async function main() {
  await ensureRuntimeDir();

  const host = getHost();
  const port = getPort();

  // Keep daemon-status compatible when the service is managed by launchd.
  await writeDaemonState({
    pid: process.pid,
    host,
    port,
    startedAt: new Date().toISOString(),
    logFile: LOG_FILE,
    manager: "launchd"
  });

  // server.mjs resolves after the HTTP server starts listening, not when it exits.
  // Keep the runtime state file in place so daemon-status can discover the
  // launchd-managed process. Stale cleanup is handled by uninstall/status logic.
  await import("../server.mjs");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
