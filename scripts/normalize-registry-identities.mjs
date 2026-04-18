import { promises as fs } from "node:fs";
import path from "node:path";

import { deriveWorkspaceIdentity, resolveUserIdentity } from "../lib/register-page.mjs";
import { loadRegistry, makeBackupPaths, saveRegistry, toPosixPath } from "../lib/registry.mjs";

async function moveBackupIfNeeded(fromUserId, toUserId, pageId) {
  if (fromUserId === toUserId) {
    return false;
  }

  const fromPaths = makeBackupPaths(fromUserId, pageId);
  const toPaths = makeBackupPaths(toUserId, pageId);

  try {
    await fs.access(fromPaths.absoluteDir);
  } catch {
    return false;
  }

  await fs.mkdir(path.dirname(toPaths.absoluteDir), { recursive: true });
  await fs.rm(toPaths.absoluteDir, { recursive: true, force: true });
  await fs.rename(fromPaths.absoluteDir, toPaths.absoluteDir);
  return true;
}

async function main() {
  const registry = await loadRegistry();
  const nextUsers = new Map();
  const moves = [];
  let backupMoves = 0;

  for (const user of registry.users) {
    for (const page of user.pages) {
      const workspaceIdentity = await deriveWorkspaceIdentity(page.sourceRoot);
      const resolvedUser = resolveUserIdentity(
        { id: user.id, name: user.name },
        workspaceIdentity
      );
      const shouldPromoteHierarchy =
        resolvedUser.userId.includes("/") &&
        (user.id !== resolvedUser.userId || user.name !== resolvedUser.userDisplayName);
      const targetUserId = shouldPromoteHierarchy ? resolvedUser.userId : user.id;
      const targetUserName = shouldPromoteHierarchy ? resolvedUser.userDisplayName : user.name;

      const bucket = nextUsers.get(targetUserId) ?? {
        id: targetUserId,
        name: targetUserName,
        description: user.description ?? "",
        pages: []
      };

      if (!bucket.description && user.description) {
        bucket.description = user.description;
      }

      const backupMoved = await moveBackupIfNeeded(user.id, targetUserId, page.id);
      if (backupMoved) {
        backupMoves += 1;
      }

      bucket.pages.push({
        ...page,
        backupHtmlPath: toPosixPath(makeBackupPaths(targetUserId, page.id).relativeLatestHtml)
      });
      nextUsers.set(targetUserId, bucket);

      if (shouldPromoteHierarchy) {
        moves.push({
          pageId: page.id,
          from: `${user.id} (${user.name})`,
          to: `${targetUserId} (${targetUserName})`
        });
      }
    }
  }

  registry.users = [...nextUsers.values()];
  await saveRegistry(registry);

  console.log(
    JSON.stringify(
      {
        changedPages: moves.length,
        movedBackups: backupMoves,
        moves
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
