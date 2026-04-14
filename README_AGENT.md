# README_AGENT

This is the detailed handbook for people or agents who want more than the GitHub homepage summary in `README.md`.

## Project Summary

AgentStage is a shared local portal for human-facing pages produced by agents.

It separates page production from page presentation:

- agents keep real HTML, CSS, JS, and assets in their own workspaces
- AgentStage mounts those source directories under one portal
- humans enter through a simple homepage and browse pages in a consistent shell
- the wrapper stays intentionally light so the embedded page remains the focal area

Default portal URL:

```text
http://127.0.0.1:4318
```

## Fast Paths

Clone and deploy on a fresh machine:

```bash
git clone https://github.com/Kyino-Pan/AgentStage.git && cd AgentStage && npm run bootstrap:machine
```

Bootstrap from an existing checkout:

```bash
npm run bootstrap:machine
```

Foreground run:

```bash
npm start
```

## Current UX Model

- The homepage centers the userSpace chooser in the middle of the screen.
- Selecting a userSpace opens its most recently mounted page by default.
- The page chrome is intentionally thin:
  - top-left: `返回导航首页`
  - next to it: `刷新当前视图`
  - right side: subtle `关于`
- The left sidebar behaves like a file manager:
  - all userSpaces are visible
  - each userSpace can be folded or expanded
  - pages live inside their userSpace group
- The wrapper shell should stay visually lighter than the embedded page.

## Runtime Options

Background daemon:

```bash
npm run daemon:start
npm run daemon:status
npm run daemon:stop
```

macOS login-persistent runtime:

```bash
npm run launchd:install
npm run launchd:status
npm run launchd:uninstall
```

Machine bootstrap:

```bash
npm run bootstrap:machine
```

What bootstrap does:

- seeds `data/registry.json` from `data/registry.example.json` if needed
- installs the global skill symlink
- starts persistent runtime
  - macOS: LaunchAgent
  - other platforms: daemon

In sandboxed Codex environments on macOS, `launchd:install` may request approval because it writes to `~/Library/LaunchAgents/`.

## Registering A Page

Standard path:

```bash
node scripts/register-page.mjs \
  --server http://127.0.0.1:4318 \
  --user "<workspace-folder-basename>" \
  --page "Phase Review" \
  --entry /absolute/path/to/index.html
```

Manifest path:

```bash
node scripts/register-page.mjs \
  --server http://127.0.0.1:4318 \
  --manifest ./templates/page.manifest.example.json
```

Direct HTTP path:

```bash
curl -s http://127.0.0.1:4318/api/register \
  -H 'Content-Type: application/json' \
  -d '{
    "user": { "name": "workspace-name" },
    "page": { "title": "Phase Review" },
    "workspaceRoot": "/absolute/path/to/workspace",
    "sourceRoot": "/absolute/path/to/workspace/out",
    "entry": "/absolute/path/to/workspace/out/index.html"
  }'
```

## Identity Rule

User space identity is workspace-derived.

- The default `--user` should be the basename of the page author's workspace folder.
- Generic identities are forbidden:
  - `codex`
  - `agent`
  - `assistant`
  - `default`
  - `test`
- If a generic name is passed, registration logic will try to derive a better user identity from the source workspace.

Example:

- workspace root: `/Users/alex/workspaces/market-scan-agent`
- required user name: `market-scan-agent`

## Default HTML Design Constraints

The skill includes a persistent descriptor that stores default HTML design constraints for future page-generation tasks.

Descriptor file:

```text
skill/agentstage-portal/default-design-constraints.json
```

Purpose:

- let a user define default visual rules once
- keep those defaults available to future agents with minimal prompt tokens
- make the portal's page output more consistent over time

Typical constraint categories:

- layout density
- visual hierarchy
- spacing
- typography
- accessibility
- forbidden UI patterns

## Hot Update Model

There are two kinds of updates.

Source-content updates:

- if an agent edits HTML, CSS, JS, or assets inside its own workspace
- no registry change is required
- no service restart is required
- refresh the current view

Registration updates:

- if an agent changes page title, page description, entry file, mounted page list, or user/page identity
- re-register the page
- no service restart is required

## API

`GET /healthz`

- health check

`GET /api/registry`

- returns the current registry view model used by the portal frontend

`POST /api/register`

- registers or updates a page at runtime

`GET /source/<user>/<page>/...`

- serves mounted source files from the page's source root
- HTML responses receive a mounted `<base href>`
- common root-absolute references are rewritten when possible

## Global Skill

Skill name:

```text
$agentstage-portal
```

Source path:

```text
skill/agentstage-portal/
```

Skill management:

```bash
npm run skill:install
npm run skill:status
npm run skill:uninstall
```

The skill is responsible for:

- deciding when a result should become a webpage
- reusing the shared AgentStage portal
- enforcing workspace-derived usernames
- applying default design constraints from the skill descriptor
- operating the shared runtime when needed

## Prompt Library

Built-in default prompt:

```text
Use $agentstage-portal to publish this result as a page in the shared AgentStage portal. Derive --user from the page author's workspace folder basename, apply default constraints from the skill descriptor, and give me the final route.
```

Publish a new page:

```text
Use $agentstage-portal to publish this result as a page in the shared portal and give me the final route.
```

Update an existing page:

```text
Use $agentstage-portal to update the existing page in place and keep the same userSpace unless the workspace name changed.
```

Add a second page under the same userSpace:

```text
Use $agentstage-portal to add another page under the same workspace-derived userSpace and keep the file-manager sidebar clean.
```

Set default HTML design constraints:

```text
Use $agentstage-portal and set default HTML design constraints for future pages: keep strong whitespace, minimal chrome, and one focal area per view.
```

Deploy on another machine:

```text
Clone the repo, cd into it, run npm run bootstrap:machine, then verify skill:status and daemon:status.
```

Recover launchd on macOS:

```text
Use $agentstage-portal to verify the running AgentStage launchd service, reclaim port 4318 if an older AgentStage process is still bound, and report the health endpoint.
```

Re-register after metadata changes:

```text
Use $agentstage-portal to re-register this page with the same workspace-derived userSpace and preserve the backup HTML history.
```

## Project Structure

```text
AgentStage/
├── AGENTS.md
├── README.md
├── README_AGENT.md
├── CONTRIBUTING.md
├── DISCLAIMER.md
├── LICENSE
├── SECURITY.md
├── backups/
├── data/
│   ├── registry.example.json
│   └── registry.json
├── examples/
├── launchd/
├── lib/
├── public/
├── runtime/
├── scripts/
├── skill/
│   └── agentstage-portal/
├── templates/
└── server.mjs
```

Key directories:

- `public/`: portal UI shell
- `lib/`: registry, registration, runtime utilities
- `scripts/`: operational commands
- `skill/agentstage-portal/`: globally installable Codex skill
- `data/`: live registry plus sanitized example registry
- `launchd/`: macOS LaunchAgent assets
- `examples/`: demo pages

## Security And Trust Boundary

AgentStage is meant for trusted local content.

Do not treat it as:

- a hardened browser sandbox
- a multi-user SaaS
- an authenticated publishing service
- a secure internet-facing host

Read `DISCLAIMER.md` and `SECURITY.md` before exposing it beyond localhost.

## Troubleshooting

A newly registered page does not show up:

```bash
cat data/registry.json
curl -s http://127.0.0.1:4318/api/registry
```

A mounted page loses styles or images:

- check whether the source HTML uses root-absolute asset paths like `/styles.css`
- prefer relative paths like `./styles.css` or `assets/chart.png`

launchd says running but the service is wrong:

```bash
npm run launchd:status
npm run daemon:status
lsof -nP -iTCP:4318 -sTCP:LISTEN
curl -s http://127.0.0.1:4318/healthz
```

Skill is missing:

```bash
npm run skill:status
```

## Related Files

- GitHub homepage summary: `README.md`
- Repo-local memory rules: `AGENTS.md`
- LaunchAgent notes: `launchd/README.md`
- Contributor guidance: `CONTRIBUTING.md`
