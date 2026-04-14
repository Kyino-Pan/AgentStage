import { LOG_FILE } from "../lib/config.mjs";
import { isProcessRunning, readDaemonState, readRecentLog } from "../lib/runtime.mjs";

async function main() {
  const state = await readDaemonState();

  if (!state) {
    console.log("AgentStage daemon status: stopped");
    return;
  }

  const running = isProcessRunning(state.pid);
  console.log(`AgentStage daemon status: ${running ? "running" : "stale"}`);
  console.log(`pid: ${state.pid}`);
  console.log(`url: http://${state.host}:${state.port}`);
  console.log(`startedAt: ${state.startedAt ?? "unknown"}`);
  console.log(`log: ${state.logFile ?? LOG_FILE}`);

  const tail = await readRecentLog();
  if (tail.trim()) {
    console.log("");
    console.log("Recent log:");
    console.log(tail.trimEnd());
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
