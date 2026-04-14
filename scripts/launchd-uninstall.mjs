import { removeDaemonState } from "../lib/runtime.mjs";
import {
  LABEL,
  PROJECT_PLIST_PATH,
  USER_PLIST_PATH,
  assertDarwin,
  getDomainTarget,
  launchctl,
  removeFileIfExists
} from "./launchd-lib.mjs";

function parseArgs(argv) {
  return {
    keepPlist: argv.includes("--keep-plist"),
    json: argv.includes("--json")
  };
}

function printResult(result, asJson) {
  if (asJson) {
    console.log(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  console.log(`LaunchAgent label: ${result.label}`);
  console.log(`Domain target: ${result.domainTarget}`);
  console.log(`Loaded before uninstall: ${result.loadedBefore}`);
  console.log(`Removed plist: ${result.removedPlist}`);
}

async function main() {
  assertDarwin();

  const { keepPlist, json } = parseArgs(process.argv.slice(2));
  const domainTarget = getDomainTarget();

  const printRes = await launchctl(["print", domainTarget], { allowFailure: true });
  const loadedBefore = printRes.ok;

  await launchctl(["bootout", domainTarget], { allowFailure: true });
  await launchctl(["disable", domainTarget], { allowFailure: true });

  let removedPlist = false;
  if (!keepPlist) {
    await removeFileIfExists(USER_PLIST_PATH);
    await removeFileIfExists(PROJECT_PLIST_PATH);
    removedPlist = true;
  }

  await removeDaemonState();

  printResult(
    {
      action: "launchd-uninstall",
      label: LABEL,
      domainTarget,
      loadedBefore,
      removedPlist
    },
    json
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
