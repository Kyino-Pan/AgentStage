import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { PROJECT_ROOT } from "../lib/config.mjs";

const SKILL_NAME = "agentstage-portal";
const SOURCE_SKILL_DIR = path.join(PROJECT_ROOT, "skill", SKILL_NAME);
const TARGET_SKILL_DIR = path.join(os.homedir(), ".codex", "skills", SKILL_NAME);

async function readLinkSafe(targetPath) {
  try {
    return await fs.readlink(targetPath);
  } catch (error) {
    if (error && error.code === "EINVAL") {
      return null;
    }

    if (error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function lstatSafe(targetPath) {
  try {
    return await fs.lstat(targetPath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function installSkill() {
  await fs.mkdir(path.dirname(TARGET_SKILL_DIR), { recursive: true });

  const existing = await lstatSafe(TARGET_SKILL_DIR);
  if (existing) {
    if (existing.isSymbolicLink()) {
      const currentLink = await readLinkSafe(TARGET_SKILL_DIR);
      const resolvedCurrent = currentLink ? path.resolve(path.dirname(TARGET_SKILL_DIR), currentLink) : null;

      if (resolvedCurrent === SOURCE_SKILL_DIR) {
        console.log(`Global skill already linked: ${TARGET_SKILL_DIR}`);
        return;
      }

      await fs.unlink(TARGET_SKILL_DIR);
    } else {
      throw new Error(`Target already exists and is not a symlink: ${TARGET_SKILL_DIR}`);
    }
  }

  await fs.symlink(SOURCE_SKILL_DIR, TARGET_SKILL_DIR, "dir");
  console.log(`Installed global skill: ${TARGET_SKILL_DIR}`);
  console.log(`Source: ${SOURCE_SKILL_DIR}`);
}

async function statusSkill() {
  const existing = await lstatSafe(TARGET_SKILL_DIR);
  if (!existing) {
    console.log("Global skill status: missing");
    console.log(`Expected target: ${TARGET_SKILL_DIR}`);
    return;
  }

  if (!existing.isSymbolicLink()) {
    console.log("Global skill status: present-but-not-symlink");
    console.log(`Target: ${TARGET_SKILL_DIR}`);
    return;
  }

  const currentLink = await readLinkSafe(TARGET_SKILL_DIR);
  const resolvedCurrent = currentLink ? path.resolve(path.dirname(TARGET_SKILL_DIR), currentLink) : null;
  const synced = resolvedCurrent === SOURCE_SKILL_DIR;

  console.log(`Global skill status: ${synced ? "linked" : "linked-to-other-target"}`);
  console.log(`Target: ${TARGET_SKILL_DIR}`);
  console.log(`Link path: ${currentLink ?? "unknown"}`);
  console.log(`Resolved: ${resolvedCurrent ?? "unknown"}`);
  console.log(`Source: ${SOURCE_SKILL_DIR}`);
}

async function uninstallSkill() {
  const existing = await lstatSafe(TARGET_SKILL_DIR);
  if (!existing) {
    console.log("Global skill already absent.");
    return;
  }

  if (!existing.isSymbolicLink()) {
    throw new Error(`Refusing to remove non-symlink target: ${TARGET_SKILL_DIR}`);
  }

  await fs.unlink(TARGET_SKILL_DIR);
  console.log(`Removed global skill link: ${TARGET_SKILL_DIR}`);
}

async function main() {
  const action = process.argv[2] ?? "status";

  if (action === "install") {
    await installSkill();
    return;
  }

  if (action === "status") {
    await statusSkill();
    return;
  }

  if (action === "uninstall") {
    await uninstallSkill();
    return;
  }

  throw new Error(`Unknown action: ${action}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
