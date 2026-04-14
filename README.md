# AgentStage

AgentStage is a shared local portal for human-facing pages produced by agents.

It gives multiple agents one stable place to publish static HTML pages under:

- one localhost address
- one centered homepage for choosing a userSpace
- one restrained wrapper around embedded pages
- one shared sidebar shaped like a file manager
- one hot-update registration flow

The portal is optimized for human browsing, even though its operators are usually agents.

## What It Does

AgentStage separates page production from page presentation.

- Agents keep real HTML, CSS, JS, and assets in their own workspaces.
- AgentStage mounts those source directories under one portal.
- Humans enter through a simple homepage and then browse pages in a consistent shell.
- The shell stays intentionally light so the embedded page remains the focal area.

## Current UX Model

- The homepage centers the userSpace chooser in the middle of the screen.
- The project description, heat-update explanation, and implementation notes live in `/about`, not on the homepage.
- Selecting a userSpace opens its most recently mounted page by default.
- The page chrome is intentionally thin:
  - top-left: `返回导航首页`
  - next to it: `刷新当前视图`
  - right side: subtle `关于`
- The left sidebar behaves like a file manager:
  - all userSpaces are visible
  - each userSpace can be folded or expanded
  - pages live inside their userSpace group

## Quick Start

```bash
cd <project-root>
npm start
```

Default URL:

```text
http://127.0.0.1:4318
```

## Persistent Runtime

### Background daemon

```bash
npm run daemon:start
npm run daemon:status
npm run daemon:stop
```

### macOS login-persistent runtime

```bash
npm run launchd:install
npm run launchd:status
npm run launchd:uninstall
```

In sandboxed Codex environments, `launchd:install` may request elevated permission because it writes `~/Library/LaunchAgents/`.

LaunchAgent label:

```text
com.agentstage.daemon
```

## Registering a Page

### Standard path

```bash
node scripts/register-page.mjs \
  --server http://127.0.0.1:4318 \
  --user "<workspace-folder-basename>" \
  --page "Phase Review" \
  --entry /absolute/path/to/index.html
```

### Manifest path

```bash
node scripts/register-page.mjs \
  --server http://127.0.0.1:4318 \
  --manifest ./templates/page.manifest.example.json
```

### Direct HTTP path

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

- The default `--user` should be the basename of the page author’s workspace folder.
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
- make the portal’s page output more consistent over time

Typical constraint categories:

- layout density
- visual hierarchy
- spacing
- typography
- accessibility
- forbidden UI patterns

## Hot Update Model

There are two kinds of updates.

### Source-content updates

If an agent edits HTML/CSS/JS/assets inside its own workspace:

- no registry change is required
- no service restart is required
- refresh the current view

### Registration updates

If an agent changes:

- page title
- page description
- entry file
- mounted page list
- user/page identity

then re-register the page:

```bash
node scripts/register-page.mjs --server http://127.0.0.1:4318 ...
```

No service restart is required.

## API

### `GET /healthz`

Health check.

### `GET /api/registry`

Returns the current registry view model used by the portal frontend.

### `POST /api/register`

Registers or updates a page at runtime.

### `GET /source/<user>/<page>/...`

Serves mounted source files from the page’s source root.

HTML responses receive:

- a mounted `<base href>`
- root-absolute reference rewriting for common cases

## Project Structure

```text
AgentStage/
├── AGENTS.md
├── README.md
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

### Key directories

- `public/`: portal UI shell
- `lib/`: registry, registration, runtime utilities
- `scripts/`: operational commands
- `skill/agentstage-portal/`: globally installable Codex skill
- `data/`: live registry plus sanitized example registry
- `launchd/`: macOS LaunchAgent assets
- `examples/`: demo pages

## Important Scripts

### Runtime

- `npm start`
- `npm run daemon:start`
- `npm run daemon:status`
- `npm run daemon:stop`
- `npm run launchd:install`
- `npm run launchd:status`
- `npm run launchd:uninstall`

### Skill

- `npm run skill:install`
- `npm run skill:status`
- `npm run skill:uninstall`

### Portable deployment

- `npm run bootstrap:machine`

## Portable Deployment

For another computer, the lowest-token path is:

```bash
cd <project-root>
npm run bootstrap:machine
```

What it does:

- seeds `data/registry.json` from `data/registry.example.json` if needed
- installs the global skill symlink
- starts persistent runtime
  - macOS: LaunchAgent
  - other platforms: daemon

In sandboxed Codex environments on macOS, expect an approval prompt when bootstrap reaches the LaunchAgent installation step.

Follow-up checks:

```bash
npm run skill:status
npm run daemon:status
```

On macOS:

```bash
npm run launchd:status
```

## Global Skill

Skill name:

```text
$agentstage-portal
```

Source path:

```text
skill/agentstage-portal/
```

The skill is responsible for:

- deciding when a result should become a webpage
- reusing the shared AgentStage portal
- enforcing workspace-derived usernames
- applying default design constraints from the skill descriptor
- operating the shared runtime when needed

## Prompt Library

These are the recommended prompts to keep token usage low.

### Built-in default prompt

This is the prompt fragment shipped in `skill/agentstage-portal/agents/openai.yaml`:

```text
Use $agentstage-portal to publish this result as a page in the shared AgentStage portal. Derive --user from the page author's workspace folder basename, apply default constraints from the skill descriptor, and give me the final route.
```

### Publish a new page

```text
Use $agentstage-portal to publish this result as a page in the shared portal and give me the final route.
```

### Update an existing page

```text
Use $agentstage-portal to update the existing page in place and keep the same userSpace unless the workspace name changed.
```

### Add a second page under the same userSpace

```text
Use $agentstage-portal to add another page under the same workspace-derived userSpace and keep the file-manager sidebar clean.
```

### Set default HTML design constraints

```text
Use $agentstage-portal and set default HTML design constraints for future pages: keep strong whitespace, minimal chrome, and one focal area per view.
```

Primitive name:

```text
set_default_html_constraints
```

Primitive payload fields:

- `constraints`
- `author`
- `notes` (optional)

Descriptor file:

```text
skill/agentstage-portal/default-design-constraints.json
```

Task-time prompt prefix generated from the skill contract:

```text
Apply default constraints from skill descriptor before writing HTML.
```

### Deploy on another machine

```text
Clone the repo, cd into it, run npm run bootstrap:machine, then verify skill:status and daemon:status.
```

### Recover launchd on macOS

```text
Use $agentstage-portal to verify the running AgentStage launchd service, reclaim port 4318 if an older AgentStage process is still bound, and report the health endpoint.
```

### Re-register after metadata changes

```text
Use $agentstage-portal to re-register this page with the same workspace-derived userSpace and preserve the backup HTML history.
```

## Prompt Surfaces Summary

Prompt-bearing files in this repo:

- `skill/agentstage-portal/SKILL.md`: main skill contract, identity rule, runtime workflow, primitive definition
- `skill/agentstage-portal/agents/openai.yaml`: default implicit prompt for Codex/OpenAI environments
- `skill/agentstage-portal/default-design-constraints.json`: persistent design-policy descriptor consumed by future page-generation tasks
- `skill/agentstage-portal/references/deployment.md`: ultra-short deployment wording for another machine
- `AGENTS.md`: repository-local memory rules for future agents editing this project

## Open-Source Preparation

The repository now includes:

- `LICENSE`
- `DISCLAIMER.md`
- `SECURITY.md`
- `CONTRIBUTING.md`
- `.gitignore`
- `data/registry.example.json`

### Why these matter

- `DISCLAIMER.md`: clarifies that this is a localhost-oriented trusted-content portal
- `SECURITY.md`: sets expectations for risk and reporting
- `CONTRIBUTING.md`: reduces friction for external contributors
- `.gitignore`: prevents leaking local runtime state, registry data, backups, and logs
- `data/registry.example.json`: keeps the repo portable without shipping a live private registry

## Security / Trust Boundary

AgentStage is meant for trusted local content.

Do not treat it as:

- a hardened browser sandbox
- a multi-user SaaS
- an authenticated publishing service
- a secure internet-facing host

Read:

- `DISCLAIMER.md`
- `SECURITY.md`

before exposing it beyond localhost.

## Troubleshooting

### A newly registered page does not show up

Check:

```bash
cat data/registry.json
curl -s http://127.0.0.1:4318/api/registry
```

### A mounted page loses styles or images

Check whether the source HTML uses root-absolute asset paths like `/styles.css`.

Prefer relative paths:

- `./styles.css`
- `assets/chart.png`

### launchd says running but the service is wrong

Check:

```bash
npm run launchd:status
npm run daemon:status
lsof -nP -iTCP:4318 -sTCP:LISTEN
curl -s http://127.0.0.1:4318/healthz
```

### Skill is missing

Check:

```bash
npm run skill:status
```

## Recommended Rule For Future Agents

1. Prefer `$agentstage-portal`.
2. Prefer runtime registration over service restarts.
3. Keep the homepage human-focused.
4. Keep wrapper chrome lighter than the embedded page.
5. Keep user identity derived from workspace folder names.
