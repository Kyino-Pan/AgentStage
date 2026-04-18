import { createRegisterPayload, loadManifestFile, registerPage } from "../lib/register-page.mjs";

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return options;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/register-page.mjs --user-id \"project-name-or-project/subproject\" --user-name \"project-name-or-project/subproject\" --workspace-root /abs/path/to/workspace --page \"Phase Review\" --entry /abs/path/to/index.html",
    "  node scripts/register-page.mjs --manifest ./templates/page.manifest.example.json",
    "  node scripts/register-page.mjs --server http://127.0.0.1:4318 --manifest ./templates/page.manifest.example.json",
    "",
    "Optional flags:",
    "  --server, --user, --user-id, --user-name, --user-description",
    "  --page-id, --title, --description, --workspace-root, --source-root"
  ].join("\n");
}

async function registerViaHttp(serverUrl, payload) {
  const target = new URL("/api/register", serverUrl);
  const response = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) : {};

  if (!response.ok) {
    throw new Error(parsed.detail || parsed.error || `Register request failed: ${response.status}`);
  }

  return parsed;
}

function buildPayloadFromOptions(options, manifest) {
  return createRegisterPayload({
    user: manifest.user,
    page: manifest.page,
    workspaceRoot: options["workspace-root"] ?? manifest["workspace-root"] ?? manifest.workspaceRoot,
    sourceRoot: options["source-root"] ?? manifest["source-root"] ?? manifest.sourceRoot,
    entry: options.entry ?? manifest.entry,
    userName: options["user-name"] ?? options.user,
    userId: options["user-id"] ?? options.user,
    userDescription: options["user-description"],
    pageTitle: options.title ?? options.page,
    pageId: options["page-id"],
    pageDescription: options.description
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(usage());
    return;
  }

  const manifest = await loadManifestFile(options.manifest);
  const payload = buildPayloadFromOptions(options, manifest);

  if (!payload.page.title || !payload.entry) {
    throw new Error(`Missing required input.\n\n${usage()}`);
  }

  const result = options.server
    ? await registerViaHttp(options.server, payload)
    : await registerPage(payload);

  console.log(`Registered page: ${result.user.name} / ${result.page.title}`);
  console.log(`Route: ${result.route}`);
  console.log(`Live source: ${result.liveUrl}`);
  console.log(`Backup HTML: ${result.backupUrl}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
