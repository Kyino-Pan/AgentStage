import { getUpdateStatus } from "../lib/update.mjs";

function parseArgs(argv) {
  return {
    force: argv.includes("--force"),
    json: argv.includes("--json")
  };
}

function printStatus(status) {
  console.log(`Update mode: ${status.mode}`);
  console.log(`Checked at: ${status.checkedAt ?? "never"}`);
  console.log(`Local commit: ${status.localCommit ?? "unknown"}`);
  console.log(`Remote commit: ${status.remoteCommit ?? "unknown"}`);
  console.log(`Update available: ${status.hasUpdate ? "yes" : "no"}`);
  console.log(`Badge visible: ${status.showBadge ? "yes" : "no"}`);

  if (status.dirtyWorktree) {
    console.log("Worktree: dirty");
  }

  if (status.autoUpdatedAt) {
    console.log(`Last auto update: ${status.autoUpdatedAt}`);
  }

  if (status.lastError) {
    console.log(`Error: ${status.lastError}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const status = await getUpdateStatus({ force: options.force });

  if (options.json) {
    console.log(`${JSON.stringify(status, null, 2)}\n`);
    return;
  }

  printStatus(status);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
