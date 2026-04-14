import { removeDaemonState, isProcessRunning, readDaemonState } from "../lib/runtime.mjs";

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main() {
  const state = await readDaemonState();
  if (!state) {
    console.log("AgentStage daemon is not running.");
    return;
  }

  if (!isProcessRunning(state.pid)) {
    await removeDaemonState();
    console.log("Removed stale AgentStage daemon state.");
    return;
  }

  process.kill(state.pid, "SIGTERM");

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!isProcessRunning(state.pid)) {
      await removeDaemonState();
      console.log(`Stopped AgentStage daemon: pid=${state.pid}`);
      return;
    }

    await wait(150);
  }

  throw new Error(`Timed out while stopping AgentStage daemon: pid=${state.pid}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
