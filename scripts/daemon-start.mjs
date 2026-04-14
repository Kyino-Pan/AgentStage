import { openSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

import { DEFAULT_HOST, DEFAULT_PORT, LOG_FILE, PROJECT_ROOT } from "../lib/config.mjs";
import { ensureRuntimeDir, isProcessRunning, readDaemonState, writeDaemonState } from "../lib/runtime.mjs";

function formatUrl(host, port) {
  return `http://${host}:${port}`;
}

async function main() {
  await ensureRuntimeDir();

  const previousState = await readDaemonState();
  if (previousState && isProcessRunning(previousState.pid)) {
    console.log(`AgentStage daemon already running: pid=${previousState.pid}`);
    console.log(`URL: ${formatUrl(previousState.host, previousState.port)}`);
    return;
  }

  const host = process.env.HOST ?? DEFAULT_HOST;
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const stdoutFd = openSync(LOG_FILE, "a");
  const stderrFd = openSync(LOG_FILE, "a");

  const child = spawn(process.execPath, [path.join(PROJECT_ROOT, "server.mjs")], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: ["ignore", stdoutFd, stderrFd],
    env: {
      ...process.env,
      HOST: host,
      PORT: String(port)
    }
  });

  child.unref();

  await writeDaemonState({
    pid: child.pid,
    host,
    port,
    startedAt: new Date().toISOString(),
    logFile: LOG_FILE
  });

  console.log(`AgentStage daemon started: pid=${child.pid}`);
  console.log(`URL: ${formatUrl(host, port)}`);
  console.log(`Log: ${LOG_FILE}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
