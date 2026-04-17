# AgentStage

AgentStage is a shared local portal for human-facing pages produced by agents.

Use it when multiple agents are generating static HTML in different workspaces, but humans should browse everything from one clean local URL instead of chasing separate folders and ad-hoc servers.

## What You Get

- One localhost entry point: `http://127.0.0.1:4318`
- One homepage for choosing a workspace-derived userSpace
- One light wrapper shell around embedded pages
- Hot registration updates without rebuilding every page project
- Source HTML, CSS, JS, and assets kept in the original workspace whenever possible

## Choose A Run Mode

Prerequisite: `git` and `node` are already installed on the machine.

Foreground run:

```bash
git clone https://github.com/Kyino-Pan/AgentStage.git && cd AgentStage && npm start
```

Quick background run:

```bash
git clone https://github.com/Kyino-Pan/AgentStage.git && cd AgentStage && npm run bootstrap:machine
```

Then open `http://127.0.0.1:4318`.

If the repo is already on disk:

Foreground:

```bash
npm start
```

Background:

```bash
npm run bootstrap:machine
```

- `npm start` keeps the server attached to the current terminal and stops with `Ctrl+C`.
- `npm run bootstrap:machine` seeds local state, installs the global skill link, and starts background runtime.
- On macOS, `bootstrap:machine` installs a `launchd`-managed background service.
- On Linux and Windows, `bootstrap:machine` starts a detached background daemon. If you want an OS-native persistent service, use the platform commands below.

<details>
<summary>Persistent service commands for macOS, Linux, and Windows</summary>

macOS:

```bash
git clone https://github.com/Kyino-Pan/AgentStage.git && cd AgentStage && node scripts/bootstrap-machine.mjs --runtime none && npm run launchd:install
```

Linux `systemd --user` service:

Run these from the repo root after cloning:

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
```

If you want the Linux user service to keep running after logout, also run:

```bash
loginctl enable-linger "$USER"
```

Windows PowerShell scheduled task:

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
```

This Windows path is login-persistent. For a machine-wide Windows service that starts before login, you will need an admin-managed service wrapper outside the scripts shipped in this repo.
</details>

## Background Overhead

Background deployment is convenient, but it is not free:

- it keeps a Node process alive and reserves port `4318`
- it writes runtime state and logs over time
- it adds startup hooks or service/task metadata that you may need to update or remove later
- it creates ongoing idle memory use and occasional CPU wakeups even when nobody is browsing

## How It Works

1. An agent creates a static HTML page in its own workspace.
2. The agent registers that page into AgentStage.
3. A human opens one portal and browses all registered pages from there.

Example registration command:

```bash
node scripts/register-page.mjs --server http://127.0.0.1:4318 --user "<workspace-folder-name>" --page "Demo Page" --entry /absolute/path/to/index.html
```

## Prompts For Deeper Exploration

If you want your own agent to explain or audit this project, start with one of these:

```text
Read README_AGENT.md, AGENTS.md, and skill/agentstage-portal/SKILL.md. Then explain what AgentStage is for, who it is for, and how its local portal model works.
```

```text
Read README_AGENT.md and show me the fastest way to run AgentStage on this machine, verify it is healthy, and register a sample page end to end.
```

```text
Read README_AGENT.md and explain the architecture, runtime model, registration flow, identity rule, backup behavior, and the main trust/security limits of this project.
```

## Read More

- Detailed handbook: `README_AGENT.md`
- Project memory and guardrails: `AGENTS.md`
- Human/operator limits and trust boundary: `DISCLAIMER.md`, `SECURITY.md`
