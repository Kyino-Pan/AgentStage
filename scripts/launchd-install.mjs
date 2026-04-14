import { promises as fs } from "node:fs";

import { PROJECT_ROOT } from "../lib/config.mjs";
import { ensureRuntimeDir, isProcessRunning, readDaemonState, removeDaemonState } from "../lib/runtime.mjs";
import {
  LABEL,
  PROJECT_PLIST_PATH,
  SCRIPT_PATH,
  USER_PLIST_PATH,
  assertDarwin,
  getDomainTarget,
  getHost,
  getPort,
  launchctl,
  listListeningPidsOnPort,
  readProcessCommand,
  renderPlist,
  writePlistFiles,
  writeTemplateFile
} from "./launchd-lib.mjs";

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    json: argv.includes("--json")
  };
}

async function printResult(result, asJson) {
  if (asJson) {
    console.log(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  console.log(`LaunchAgent label: ${result.label}`);
  console.log(`Domain target: ${result.domainTarget}`);
  console.log(`Host: ${result.host}`);
  console.log(`Port: ${result.port}`);
  console.log(`Project plist: ${result.projectPlistPath}`);
  console.log(`Installed plist: ${result.userPlistPath}`);
  console.log(`Loaded: ${result.loaded}`);
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function stopLegacyDaemonIfNeeded() {
  const state = await readDaemonState();
  if (!state || state.manager === "launchd" || !isProcessRunning(state.pid)) {
    return { stopped: false, reason: "no-legacy-daemon" };
  }

  process.kill(state.pid, "SIGTERM");
  for (let i = 0; i < 20; i += 1) {
    if (!isProcessRunning(state.pid)) {
      await removeDaemonState();
      return { stopped: true, pid: state.pid };
    }
    await wait(150);
  }

  throw new Error(`Timed out while stopping legacy daemon process: pid=${state.pid}`);
}

async function stopConflictingAgentStagePortHolderIfNeeded(port) {
  const listeningPids = await listListeningPidsOnPort(port);
  const runtimeState = await readDaemonState();

  for (const pid of listeningPids) {
    const command = await readProcessCommand(pid);
    const matchesRuntimeState =
      runtimeState &&
      runtimeState.pid === pid &&
      Number(runtimeState.port) === Number(port);
    const isAgentStageProcess =
      matchesRuntimeState ||
      (command.includes(PROJECT_ROOT) && (command.includes("server.mjs") || command.includes("launchd-run.mjs")));

    if (!isAgentStageProcess) {
      const commandDetail = command || "unavailable";
      throw new Error(`Port ${port} is already in use by another process: pid=${pid} command=${commandDetail}`);
    }

    process.kill(pid, "SIGTERM");

    for (let i = 0; i < 20; i += 1) {
      const remainingPids = await listListeningPidsOnPort(port);
      if (!remainingPids.includes(pid)) {
        break;
      }

      await wait(150);
    }

    const remainingPids = await listListeningPidsOnPort(port);
    if (remainingPids.includes(pid)) {
      throw new Error(`Timed out while freeing port ${port} from existing AgentStage process: pid=${pid}`);
    }
  }

  return { stoppedPids: listeningPids };
}

async function main() {
  assertDarwin();

  const { dryRun, json } = parseArgs(process.argv.slice(2));
  const host = getHost();
  const port = getPort();
  const domainTarget = getDomainTarget();
  const plistContents = renderPlist({ host, port });

  if (dryRun) {
    await printResult(
      {
        action: "launchd-install",
        dryRun: true,
        label: LABEL,
        domainTarget,
        host,
        port,
        scriptPath: SCRIPT_PATH,
        projectPlistPath: PROJECT_PLIST_PATH,
        userPlistPath: USER_PLIST_PATH,
        loaded: false,
        plistPreview: plistContents
      },
      json
    );
    return;
  }

  await ensureRuntimeDir();
  await writeTemplateFile();
  await writePlistFiles(plistContents);

  // Let launchd own shutdown of an already-installed AgentStage service before
  // falling back to direct process termination for non-launchd conflicts.
  await launchctl(["bootout", domainTarget], { allowFailure: true });
  const legacyStop = await stopLegacyDaemonIfNeeded();
  const conflictStop = await stopConflictingAgentStagePortHolderIfNeeded(port);
  await launchctl(["enable", domainTarget], { allowFailure: true });
  await launchctl(["bootstrap", `gui/${process.getuid()}`, USER_PLIST_PATH]);
  await launchctl(["kickstart", "-k", domainTarget], { allowFailure: true });

  const plistExists = await fs
    .access(USER_PLIST_PATH)
    .then(() => true)
    .catch(() => false);

  await printResult(
    {
      action: "launchd-install",
      label: LABEL,
      domainTarget,
      host,
      port,
      scriptPath: SCRIPT_PATH,
      projectPlistPath: PROJECT_PLIST_PATH,
      userPlistPath: USER_PLIST_PATH,
      legacyStop,
      conflictStop,
      loaded: plistExists
    },
    json
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
