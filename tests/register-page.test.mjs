import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";

import { PROJECT_ROOT } from "../lib/config.mjs";
import { deriveWorkspaceIdentity, inferWorkspaceRoot, resolveUserIdentity } from "../lib/register-page.mjs";

async function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      ...options
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

test("resolveUserIdentity treats explicit non-generic user name as stable identity", () => {
  const resolved = resolveUserIdentity(
    { name: "iditor" },
    {
      rootIdentity: {
        userId: "iditor",
        userDisplayName: "iditor"
      },
      fullIdentity: null
    }
  );

  assert.equal(resolved.userId, "iditor");
  assert.equal(resolved.userDisplayName, "iditor");
  assert.equal(resolved.derived, false);
  assert.equal(resolved.source, "name-root");
});

test("inferWorkspaceRoot strips nested common output directories when no markers exist", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agentstage-register-"));
  const projectRoot = path.join(tempRoot, "iditor");
  const nestedOutput = path.join(projectRoot, "docs", "portal");

  await fs.mkdir(nestedOutput, { recursive: true });

  const inferred = await inferWorkspaceRoot(nestedOutput);
  assert.equal(inferred, projectRoot);
});

test("deriveWorkspaceIdentity allows a second-level child below agentSpace and truncates deeper descendants", async () => {
  const identity = await deriveWorkspaceIdentity("/Users/colaa/Projects/iditor/agentSpace/Ming-TaskSystemMaintenanceEngineer/subagents");

  assert.equal(identity.rootIdentity.userId, "iditor");
  assert.equal(identity.fullIdentity?.userId, "iditor/ming-tasksystemmaintenanceengineer");
  assert.equal(identity.fullIdentity?.userDisplayName, "iditor / Ming-TaskSystemMaintenanceEngineer");
  assert.equal(identity.truncated, true);
});

test("resolveUserIdentity expands explicit leaf agent name into project/subproject identity when workspace implies nesting", () => {
  const resolved = resolveUserIdentity(
    { name: "Ming-TaskSystemMaintenanceEngineer" },
    {
      rootIdentity: {
        userId: "iditor",
        userDisplayName: "iditor"
      },
      fullIdentity: {
        userId: "iditor/ming-tasksystemmaintenanceengineer",
        userDisplayName: "iditor / Ming-TaskSystemMaintenanceEngineer"
      }
    }
  );

  assert.equal(resolved.userId, "iditor/ming-tasksystemmaintenanceengineer");
  assert.equal(resolved.userDisplayName, "iditor / Ming-TaskSystemMaintenanceEngineer");
  assert.equal(resolved.derived, false);
  assert.equal(resolved.source, "name-leaf-expanded");
});

test("resolveUserIdentity rejects explicit third-level user paths", () => {
  assert.throws(
    () =>
      resolveUserIdentity(
        { name: "iditor/Ming-TaskSystemMaintenanceEngineer/subagents" },
        {
          rootIdentity: {
            userId: "iditor",
            userDisplayName: "iditor"
          },
          fullIdentity: {
            userId: "iditor/ming-tasksystemmaintenanceengineer",
            userDisplayName: "iditor / Ming-TaskSystemMaintenanceEngineer"
          }
        }
      ),
    /at most 2 levels/
  );
});

test("CLI --user shorthand sends stable user.id and user.name to HTTP registration", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agentstage-cli-"));
  const entryPath = path.join(tempRoot, "index.html");
  await fs.writeFile(entryPath, "<!doctype html><title>demo</title>", "utf8");

  let capturedPayload;
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/api/register") {
      response.writeHead(404).end();
      return;
    }

    let rawBody = "";
    for await (const chunk of request) {
      rawBody += chunk;
    }

    capturedPayload = JSON.parse(rawBody);
    response.writeHead(201, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        user: { id: "iditor", name: "iditor", description: "" },
        page: { id: "demo-page", title: "Demo Page" },
        route: "/users/iditor/pages/demo-page",
        liveUrl: "/source/iditor/demo-page/index.html",
        backupUrl: "/backups/iditor/demo-page/entry.latest.html"
      })
    );
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  t.after(() => {
    server.close();
  });

  const address = server.address();
  assert(address && typeof address === "object");

  const result = await runProcess(process.execPath, [
    path.join(PROJECT_ROOT, "scripts", "register-page.mjs"),
    "--server",
    `http://127.0.0.1:${address.port}`,
    "--user",
    "iditor",
    "--page",
    "Demo Page",
    "--entry",
    entryPath
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(capturedPayload.user.id, "iditor");
  assert.equal(capturedPayload.user.name, "iditor");
  assert.match(result.stdout, /Route: \/users\/iditor\/pages\/demo-page/);
});
