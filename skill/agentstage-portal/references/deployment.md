# Deployment Reference

Read this only when the task is to deploy AgentStage onto another computer.

## Minimal-token deployment path

1. Clone or copy the repository to the target machine.
2. `cd <project-root>`
3. Run:

```bash
npm run bootstrap:machine
```

Behavior:

- seeds `data/registry.json` from `data/registry.example.json` when needed
- installs the global skill symlink
- starts persistent runtime
  - macOS: LaunchAgent
  - other platforms: background daemon

Foreground alternative:

```bash
npm start
```

Notes:

- `npm start` keeps AgentStage attached to the current terminal.
- `npm run bootstrap:machine` starts background runtime.
- On Linux and Windows, `bootstrap:machine` is a detached daemon, not an OS-native service.
- For Linux `systemd --user` or Windows Task Scheduler installation commands, read `README_AGENT.md`.

Note:

- In sandboxed Codex environments on macOS, the LaunchAgent step may prompt for elevated permission because it writes to `~/Library/LaunchAgents/`.

## Follow-up checks

```bash
npm run skill:status
npm run daemon:status
npm run check-update
```

On macOS also check:

```bash
npm run launchd:status
```

## Low-token instruction for another agent

```text
Clone the repo, cd into it, run npm run bootstrap:machine, then verify skill:status and daemon:status.
```
