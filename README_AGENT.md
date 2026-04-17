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

## Choose A Run Mode

Clone and run in the foreground:

```bash
git clone https://github.com/Kyino-Pan/AgentStage.git && cd AgentStage && npm start
```

Clone and run in the background:

```bash
git clone https://github.com/Kyino-Pan/AgentStage.git && cd AgentStage && npm run bootstrap:machine
```

If the repository is already on disk, foreground run is:

```bash
npm start
```

If the repository is already on disk, quick background run is:

```bash
npm run bootstrap:machine
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

Foreground run:

```bash
npm start
```

- runs `server.mjs` in the current terminal
- easiest path for active development
- stop with `Ctrl+C`

Background daemon:

```bash
npm run daemon:start
npm run daemon:status
npm run daemon:stop
```

- starts a detached Node process
- useful when you want the portal to keep running after the terminal closes
- on Linux and Windows this is the default background mode used by `bootstrap:machine`

macOS login-persistent runtime:

```bash
npm run launchd:install
npm run launchd:status
npm run launchd:uninstall
```

- OS-native background service on macOS
- this is the default background mode used by `bootstrap:machine` on macOS

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

## OS-Native Persistent Service Commands

macOS LaunchAgent install:

```bash
node scripts/bootstrap-machine.mjs --runtime none
npm run launchd:install
npm run launchd:status
```

Linux `systemd --user` service install:

Run these from the repo root:

```bash
node scripts/bootstrap-machine.mjs --runtime none
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/agentstage.service <<EOF
[Unit]
Description=AgentStage local portal

[Service]
Type=simple
WorkingDirectory=${PWD}
ExecStart=$(command -v node) ${PWD}/server.mjs
Restart=on-failure
RestartSec=3
Environment=HOST=127.0.0.1
Environment=PORT=4318

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now agentstage.service
systemctl --user status agentstage.service
```

If you want the Linux user service to keep running after logout, also enable linger:

```bash
loginctl enable-linger "$USER"
```

Linux `systemd --user` service removal:

```bash
systemctl --user disable --now agentstage.service
rm -f ~/.config/systemd/user/agentstage.service
systemctl --user daemon-reload
```

Windows PowerShell scheduled task install:

Run these from the repo root in PowerShell:

```powershell
node scripts/bootstrap-machine.mjs --runtime none
$root = (Get-Location).Path
$node = (Get-Command node).Source
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$root\server.mjs`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable
Register-ScheduledTask -TaskName "AgentStage" -Action $action -Trigger $trigger -Settings $settings -Description "AgentStage local portal" -Force
Start-ScheduledTask -TaskName "AgentStage"
Get-ScheduledTask -TaskName "AgentStage"
```

This Windows path is login-persistent. For a machine-wide Windows service that starts before login, use an admin-managed service wrapper outside the scripts shipped in this repo.

Windows scheduled task removal:

```powershell
Stop-ScheduledTask -TaskName "AgentStage"
Unregister-ScheduledTask -TaskName "AgentStage" -Confirm:$false
```

## Background Deployment Overhead

Background deployment is convenient, but it adds operating cost:

- one Node process stays alive and keeps port `4318` reserved
- daemon or service logs can accumulate over time
- startup hooks, service units, or scheduled tasks become extra machine state to maintain
- auto-restart behavior can make an old instance come back if you forget to disable its service definition
- idle memory use becomes persistent, with occasional CPU wakeups even when traffic is light

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
- reading default design constraints from the skill descriptor when creating a new page

Hard rule for this skill:

- it is create-only
- it must not modify any existing file
- it must not delete any file
- it may only create a brand-new page
- runtime operations, descriptor edits, existing page updates, and registry mutations must be handled outside the skill

## Prompt Library

Built-in default prompt:

```text
Use $agentstage-portal to create a brand-new page for the shared AgentStage portal. Do not modify or delete any existing file, derive --user from the page author's workspace folder basename, apply default constraints by reading the skill descriptor only, and return the new page path plus the suggested registration command.
```

Publish a new page:

```text
Use $agentstage-portal to create a brand-new page for the shared portal without modifying any existing file, and give me the new page path plus the suggested registration command.
```

Add a second page under the same userSpace:

```text
Use $agentstage-portal to add another brand-new page under the same workspace-derived userSpace without editing any existing page.
```

Create a replacement as a new page instead of editing:

```text
Use $agentstage-portal to create a fresh replacement page as a new page. Do not update the old page in place.
```

What not to ask this skill to do:

```text
Do not use $agentstage-portal for updating an existing page, editing default constraints, changing runtime state, repairing registry data, or deleting files. Use a separate non-skill workflow for those tasks.
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
