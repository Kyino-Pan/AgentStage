# AgentStage

AgentStage is a shared local portal for human-facing pages produced by agents.

Use it when multiple agents are generating static HTML in different workspaces, but humans should browse everything from one clean local URL instead of chasing separate folders and ad-hoc servers.

## What You Get

- One localhost entry point: `http://127.0.0.1:4318`
- One homepage for choosing a workspace-derived userSpace
- One light wrapper shell around embedded pages
- Hot registration updates without rebuilding every page project
- Source HTML, CSS, JS, and assets kept in the original workspace whenever possible

## One-Line Deploy

Prerequisite: `git` and `node` are already installed on the machine.

```bash
git clone https://github.com/Kyino-Pan/AgentStage.git && cd AgentStage && npm run bootstrap:machine
```

Then open `http://127.0.0.1:4318`.

If the repo is already on disk, the shortest path is:

```bash
npm run bootstrap:machine
```

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
