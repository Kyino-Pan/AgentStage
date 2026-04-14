---
name: "agentstage-portal"
description: "Use when the user wants content presented as a webpage through the shared AgentStage portal, needs a static HTML page published under the common navigation, wants a page registered or updated in the running portal service, or needs the shared AgentStage daemon/launchd runtime managed."
---

# AgentStage Portal

## When to use

- The user wants a report, dashboard, prototype, comparison, or summary shown as a webpage.
- The page should live under the shared AgentStage navigation instead of a one-off local server.
- A new or existing static HTML page must be registered into the running AgentStage service.
- The agent needs to operate the shared portal runtime, backups, daemon, or launchd setup.

## Project root resolution

- Project root is the repository that contains this skill under `skill/agentstage-portal/`.
- Shared portal URL defaults to `http://127.0.0.1:4318`.
- Read project handbook only when needed: `<project-root>/README_AGENT.md`
- Read project memory rules only when needed: `<project-root>/AGENTS.md`

## Core contract

1. Keep the actual HTML, CSS, JS, and assets in your own workspace whenever possible.
2. Register only the entry HTML into AgentStage; the project will proxy source assets from your workspace.
3. Use relative asset paths inside the source page. Avoid root-absolute paths like `/styles.css`.
4. Reuse the same `user-id` for related pages so the wrapper shows them in one sidebar.
5. Re-register the page after entry-path or metadata changes. If only source assets changed, refreshing the page is enough.

## Identity rule (mandatory)

`--user` must come from the page author's workspace folder basename, never a generic persona name.

- Required source of truth: the basename of the workspace directory that contains the page source.
- Use the basename itself by default.
- Forbidden generic names: `codex`, `agent`, `assistant`, `default`, `test` (case-insensitive).
- If an existing page was registered with a forbidden generic name, re-register it with the workspace-derived user label.

Fast derivation example:

- Workspace: `/Users/alex/workspaces/market-scan-agent`
- Required `--user`: `market-scan-agent`

## Standard workflow

1. Check whether AgentStage is already running:
   - `cd <project-root>`
   - `npm run daemon:status`
2. If it is not running, start it:
   - `npm run daemon:start`
3. Produce or update a static HTML page in your own workspace.
4. Derive `--user` from workspace folder name (see Identity rule).
5. Register it into the running portal:
   - `node scripts/register-page.mjs --server http://127.0.0.1:4318 --user "<workspace-folder-derived-name>" --page "Page Title" --entry /absolute/path/to/index.html`
6. Tell the user the final route from the command output, usually `/users/<user-id>/pages/<page-id>`.

## New primitive: default HTML design constraints

Purpose: allow users to define default design constraints once, then apply them to all future portal pages with minimal tokens.

Descriptor file (skill-side):

- `<project-root>/skill/agentstage-portal/default-design-constraints.json`

Primitive name:

- `set_default_html_constraints`

Inputs:

- `constraints`: concise rule list (layout, typography, spacing, color, interaction, accessibility, forbidden patterns).
- `author`: who set the defaults.
- `notes` (optional): context or rationale.

Workflow:

1. Read current descriptor file.
2. Merge or replace the `constraints` list based on the user's request.
3. Update metadata (`updated_at`, `author`).
4. Persist descriptor file.
5. For subsequent page-generation prompts, prepend a short line: `Apply default constraints from skill descriptor before writing HTML.`

Consumption rule for agents:

- When this skill is invoked for page generation, read `default-design-constraints.json` first.
- Treat constraints as default policy unless the user explicitly overrides specific items.
- If a user override conflicts with defaults, keep explicit user override for that task and do not silently mutate descriptor.

## Registration choices

- For a single page, use `scripts/register-page.mjs`.
- For automated flows, `POST /api/register` is also supported.
- For repeatable handoffs, use `<project-root>/templates/page.manifest.example.json` as the starting schema.
- For deployment on another computer, read `references/deployment.md`.

## Runtime operations

- Foreground run: `npm start`
- Background daemon: `npm run daemon:start`
- Daemon status: `npm run daemon:status`
- Machine bootstrap: `npm run bootstrap:machine`
- Global skill link status: `npm run skill:status`
- On macOS in sandboxed Codex environments, `npm run launchd:install` may require approval because it writes to `~/Library/LaunchAgents/`.

## Read more only when needed

- For architecture, API routes, prompt templates, and troubleshooting, read `<project-root>/README_AGENT.md`.
- For portal rules that future agents should preserve, read `<project-root>/AGENTS.md`.
