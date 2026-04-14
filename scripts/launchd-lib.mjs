import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { DEFAULT_HOST, DEFAULT_PORT, LOG_FILE, PROJECT_ROOT } from "../lib/config.mjs";

const execFileAsync = promisify(execFile);

export const LABEL = "com.agentstage.daemon";
export const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);
export const SCRIPT_PATH = path.join(PROJECT_ROOT, "scripts", "launchd-run.mjs");
export const LAUNCHD_DIR = path.join(PROJECT_ROOT, "launchd");
export const PROJECT_PLIST_PATH = path.join(LAUNCHD_DIR, `${LABEL}.plist`);
export const PROJECT_TEMPLATE_PATH = path.join(LAUNCHD_DIR, `${LABEL}.plist.template`);
export const USER_PLIST_PATH = path.join(os.homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);

export function getHost() {
  return process.env.HOST ?? DEFAULT_HOST;
}

export function getPort() {
  return Number(process.env.PORT ?? DEFAULT_PORT);
}

export function getDomainTarget(label = LABEL) {
  return `gui/${process.getuid()}/${label}`;
}

export function assertDarwin() {
  if (process.platform !== "darwin") {
    throw new Error("LaunchAgent support is macOS only.");
  }
}

export function renderPlist({
  label = LABEL,
  nodePath = process.execPath,
  scriptPath = SCRIPT_PATH,
  cwd = PROJECT_ROOT,
  host = getHost(),
  port = getPort(),
  stdoutPath = LOG_FILE,
  stderrPath = LOG_FILE
}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(nodePath)}</string>
    <string>${escapeXml(scriptPath)}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOST</key>
    <string>${escapeXml(String(host))}</string>
    <key>PORT</key>
    <string>${escapeXml(String(port))}</string>
  </dict>
  <key>WorkingDirectory</key>
  <string>${escapeXml(cwd)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(stderrPath)}</string>
</dict>
</plist>
`;
}

export async function ensureLaunchdPaths() {
  await fs.mkdir(LAUNCHD_DIR, { recursive: true });
  await fs.mkdir(path.dirname(USER_PLIST_PATH), { recursive: true });
}

export async function writePlistFiles(plistContents) {
  await ensureLaunchdPaths();
  await fs.writeFile(PROJECT_PLIST_PATH, plistContents, "utf8");
  await fs.writeFile(USER_PLIST_PATH, plistContents, "utf8");
}

export async function writeTemplateFile() {
  const template = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{{LABEL}}</string>
  <key>ProgramArguments</key>
  <array>
    <string>{{NODE_PATH}}</string>
    <string>{{SCRIPT_PATH}}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOST</key>
    <string>{{HOST}}</string>
    <key>PORT</key>
    <string>{{PORT}}</string>
  </dict>
  <key>WorkingDirectory</key>
  <string>{{WORKING_DIRECTORY}}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>{{STDOUT_PATH}}</string>
  <key>StandardErrorPath</key>
  <string>{{STDERR_PATH}}</string>
</dict>
</plist>
`;

  await ensureLaunchdPaths();
  await fs.writeFile(PROJECT_TEMPLATE_PATH, template, "utf8");
}

export async function launchctl(args, { allowFailure = false } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync("launchctl", args, { encoding: "utf8" });
    return {
      ok: true,
      code: 0,
      stdout: stdout ?? "",
      stderr: stderr ?? ""
    };
  } catch (error) {
    if (allowFailure) {
      return {
        ok: false,
        code: typeof error.code === "number" ? error.code : 1,
        stdout: error.stdout ?? "",
        stderr: error.stderr ?? error.message ?? String(error)
      };
    }

    const details = [error.stderr, error.stdout, error.message].filter(Boolean).join("\n").trim();
    throw new Error(details || "launchctl command failed");
  }
}

export async function execTool(command, args, { allowFailure = false } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { encoding: "utf8" });
    return {
      ok: true,
      code: 0,
      stdout: stdout ?? "",
      stderr: stderr ?? ""
    };
  } catch (error) {
    if (allowFailure) {
      return {
        ok: false,
        code: typeof error.code === "number" ? error.code : 1,
        stdout: error.stdout ?? "",
        stderr: error.stderr ?? error.message ?? String(error)
      };
    }

    const details = [error.stderr, error.stdout, error.message].filter(Boolean).join("\n").trim();
    throw new Error(details || `${command} command failed`);
  }
}

export async function listListeningPidsOnPort(port) {
  const result = await execTool("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
    allowFailure: true
  });

  if (!result.ok) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => Number(line))
    .filter((value) => Number.isInteger(value) && value > 0);
}

export async function readProcessCommand(pid) {
  const result = await execTool("ps", ["-p", String(pid), "-o", "command="], {
    allowFailure: true
  });

  if (!result.ok) {
    return "";
  }

  return result.stdout.trim();
}

export async function removeFileIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (!error || error.code !== "ENOENT") {
      throw error;
    }
  }
}

export function escapeXml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
