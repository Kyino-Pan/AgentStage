import { promises as fs } from "node:fs";

import { LOG_FILE } from "../lib/config.mjs";
import { readDaemonState, readRecentLog } from "../lib/runtime.mjs";
import {
  LABEL,
  PROJECT_PLIST_PATH,
  USER_PLIST_PATH,
  assertDarwin,
  getDomainTarget,
  launchctl
} from "./launchd-lib.mjs";

function parseArgs(argv) {
  return {
    json: argv.includes("--json")
  };
}

async function exists(filePath) {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

function printResult(result, asJson) {
  if (asJson) {
    console.log(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  console.log(`LaunchAgent label: ${result.label}`);
  console.log(`Domain target: ${result.domainTarget}`);
  console.log(`Loaded: ${result.loaded}`);
  console.log(`Project plist exists: ${result.projectPlistExists}`);
  console.log(`Installed plist exists: ${result.userPlistExists}`);
  console.log(`Runtime pid: ${result.runtime?.pid ?? "n/a"}`);
  console.log(`Runtime url: ${result.runtime?.url ?? "n/a"}`);
  console.log(`Log: ${result.logFile}`);

  if (result.launchctlPrint) {
    console.log("");
    console.log("launchctl print:");
    console.log(result.launchctlPrint.trimEnd());
  }

  if (result.logTail) {
    console.log("");
    console.log("Recent log:");
    console.log(result.logTail.trimEnd());
  }
}

async function main() {
  assertDarwin();
  const { json } = parseArgs(process.argv.slice(2));
  const domainTarget = getDomainTarget();

  const [projectPlistExists, userPlistExists, runtimeState, logTail, printResultRaw] = await Promise.all([
    exists(PROJECT_PLIST_PATH),
    exists(USER_PLIST_PATH),
    readDaemonState(),
    readRecentLog(),
    launchctl(["print", domainTarget], { allowFailure: true })
  ]);

  const result = {
    action: "launchd-status",
    label: LABEL,
    domainTarget,
    loaded: printResultRaw.ok,
    projectPlistExists,
    userPlistExists,
    runtime: runtimeState
      ? {
          pid: runtimeState.pid,
          url: `http://${runtimeState.host}:${runtimeState.port}`,
          startedAt: runtimeState.startedAt ?? null,
          manager: runtimeState.manager ?? "daemon"
        }
      : null,
    launchctlPrint: printResultRaw.ok ? printResultRaw.stdout : null,
    launchctlError: printResultRaw.ok ? null : printResultRaw.stderr,
    logFile: LOG_FILE,
    logTail
  };

  printResult(result, json);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
