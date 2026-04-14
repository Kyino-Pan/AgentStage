import path from "node:path";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { DATA_DIR, PROJECT_ROOT, REGISTRY_FILE } from "../lib/config.mjs";

const execFileAsync = promisify(execFile);
const EXAMPLE_REGISTRY_FILE = path.join(DATA_DIR, "registry.example.json");

function parseArgs(argv) {
  const args = {
    installSkill: true,
    runtime: "auto",
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--no-skill") {
      args.installSkill = false;
      continue;
    }

    if (token === "--json") {
      args.json = true;
      continue;
    }

    if (token === "--runtime") {
      args.runtime = argv[index + 1] ?? args.runtime;
      index += 1;
    }
  }

  return args;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runNodeScript(scriptName, args = []) {
  const targetPath = path.join(PROJECT_ROOT, "scripts", scriptName);
  const { stdout, stderr } = await execFileAsync(process.execPath, [targetPath, ...args], {
    cwd: PROJECT_ROOT,
    encoding: "utf8"
  });

  return {
    command: `node scripts/${scriptName}${args.length ? ` ${args.join(" ")}` : ""}`,
    stdout: (stdout ?? "").trim(),
    stderr: (stderr ?? "").trim()
  };
}

async function ensureSeedRegistry() {
  if (await exists(REGISTRY_FILE)) {
    return { seeded: false, reason: "registry-exists" };
  }

  await fs.mkdir(DATA_DIR, { recursive: true });

  if (await exists(EXAMPLE_REGISTRY_FILE)) {
    await fs.copyFile(EXAMPLE_REGISTRY_FILE, REGISTRY_FILE);
    return { seeded: true, source: EXAMPLE_REGISTRY_FILE };
  }

  await fs.writeFile(REGISTRY_FILE, '{\n  "version": 1,\n  "updatedAt": "1970-01-01T00:00:00.000Z",\n  "users": []\n}\n', "utf8");
  return { seeded: true, source: "generated-empty-registry" };
}

function resolveRuntimeMode(mode) {
  if (mode === "auto") {
    return process.platform === "darwin" ? "launchd" : "daemon";
  }

  if (!["launchd", "daemon", "none"].includes(mode)) {
    throw new Error(`Unsupported runtime mode: ${mode}`);
  }

  return mode;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runtime = resolveRuntimeMode(options.runtime);
  const result = {
    projectRoot: PROJECT_ROOT,
    registry: await ensureSeedRegistry(),
    skill: null,
    runtime: {
      mode: runtime,
      command: null,
      output: null
    }
  };

  if (options.installSkill) {
    result.skill = await runNodeScript("global-skill.mjs", ["install"]);
  }

  if (runtime === "launchd") {
    result.runtime.command = "node scripts/launchd-install.mjs";
    result.runtime.output = await runNodeScript("launchd-install.mjs");
  } else if (runtime === "daemon") {
    result.runtime.command = "node scripts/daemon-start.mjs";
    result.runtime.output = await runNodeScript("daemon-start.mjs");
  }

  if (options.json) {
    console.log(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  console.log(`Project root: ${result.projectRoot}`);
  console.log(`Registry seeded: ${result.registry.seeded ? "yes" : "no"}`);
  if (result.registry.source) {
    console.log(`Registry source: ${result.registry.source}`);
  }

  if (result.skill) {
    console.log("");
    console.log("Global skill:");
    console.log(result.skill.stdout || result.skill.command);
  }

  if (result.runtime.command && result.runtime.output) {
    console.log("");
    console.log(`Runtime mode: ${runtime}`);
    console.log(result.runtime.output.stdout || result.runtime.command);
  }

  console.log("");
  console.log("Portal URL: http://127.0.0.1:4318");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
