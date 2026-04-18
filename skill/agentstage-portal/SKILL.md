---
name: "agentstage-portal"
description: "Use when the user wants a brand-new static HTML page prepared for the shared AgentStage portal without modifying or deleting any existing files."
---

# AgentStage Portal

## When to use

- The user wants a report, dashboard, prototype, comparison, or summary shown as a webpage.
- The task is to create a brand-new static page, not to edit or replace an existing one.
- The page should be prepared for the shared AgentStage navigation instead of a one-off local server.

## Hard rule (highest priority)

This skill is create-only.

- Do not modify any existing file in any workspace or in this repository.
- Do not delete any file.
- The only allowed file write is creating a brand-new page output.
- Do not update an existing page in place.
- Do not rename or replace an existing page to simulate an update.
- Do not edit docs, configs, scripts, registry files, backups, or design-constraint files while using this skill.
- Do not start, stop, install, or reconfigure runtime services while using this skill.
- If the user asks for an update to an existing page, create a new page instead or stop and ask them to use a non-skill workflow.

## Project root resolution

- Project root is the repository that contains this skill under `skill/agentstage-portal/`.
- Shared portal URL defaults to `http://127.0.0.1:4318`.
- Read project handbook only when needed: `<project-root>/README_AGENT.md`
- Read project memory rules only when needed: `<project-root>/AGENTS.md`

## Core contract

1. Keep the actual HTML, CSS, JS, and assets in your own workspace whenever possible.
2. Only create new page files; do not edit existing ones.
3. Use relative asset paths inside the source page. Avoid root-absolute paths like `/styles.css`.
4. Derive `--user-id` and `--user-name` from the author's project identity when the page is later registered: default `<project>`, or `<project>/<child>` for supported nested workspaces. Do not create third-level identities.
5. Treat registration, runtime management, and repo maintenance as separate workflows outside this skill.

## Identity rule (mandatory)

`--user-id` and `--user-name` must come from the page author's project identity path, never a generic persona name.

- Required source of truth: the page author's project identity path derived from the page source location.
- Use `<project>` by default.
- If the page source lives under a supported nested container such as `agentSpace/<child>`, use `<project>/<child>`.
- `--user` is only a shorthand for setting both values to that same identity path.
- Third-level identities are not allowed.
- Forbidden generic names: `codex`, `agent`, `assistant`, `default`, `test` (case-insensitive).
- If an existing page was registered with a forbidden generic name, do not fix it through this skill. Use a separate non-skill workflow.

Fast derivation example:

- Workspace: `/Users/alex/workspaces/market-scan-agent`
- Required `--user-id` / `--user-name`: `market-scan-agent`

- Workspace: `/Users/alex/workspaces/iditor/agentSpace/Ming-TaskSystemMaintenanceEngineer`
- Required `--user-id` / `--user-name`: `iditor/Ming-TaskSystemMaintenanceEngineer`

## Standard workflow

1. Produce a brand-new static HTML page in your own workspace.
2. Keep all page assets relative to that new page.
3. Derive `--user-id` and `--user-name` from project identity (see Identity rule).
4. Hand off the new page path and suggested registration command to the user or to a separate non-skill workflow.

## New primitive: default HTML design constraints

Purpose: allow users to define default design constraints once, then apply them to future portal pages with minimal tokens.

Descriptor file (skill-side):

- `<project-root>/skill/agentstage-portal/default-design-constraints.json`

Primitive name:

- `set_default_html_constraints`

Inputs:

- `constraints`: concise rule list (layout, typography, spacing, color, interaction, accessibility, forbidden patterns).
- `author`: who set the defaults.
- `notes` (optional): context or rationale.

Consumption rule for agents:

- When this skill is invoked for page generation, read `default-design-constraints.json` first.
- Treat constraints as default policy unless the user explicitly overrides specific items.
- If a user override conflicts with defaults, keep explicit user override for that task and do not mutate the descriptor while using this skill.

## Registration handoff

- Registration is outside this skill because it mutates portal runtime files.
- If the user wants to register the new page, hand them one of these separate commands:
  - `node scripts/register-page.mjs --server http://127.0.0.1:4318 --user-id "<project-or-project/subproject>" --user-name "<project-or-project/subproject>" --workspace-root /absolute/path/to/workspace --source-root /absolute/path/to/workspace/out --page "Page Title" --entry /absolute/path/to/workspace/out/index.html`
  - `POST /api/register`
- For repeatable handoffs, use `<project-root>/templates/page.manifest.example.json` as the starting schema.

## Not allowed from this skill

- Runtime operations such as `npm start`, `npm run daemon:start`, `npm run bootstrap:machine`, and `npm run launchd:install`
- Registry repair or backup manipulation
- Default-constraint descriptor updates
- Existing page edits, replacements, deletions, or re-registration

## Read more only when needed

- For architecture, API routes, runtime commands, and troubleshooting, read `<project-root>/README_AGENT.md`.
- For portal rules that future agents should preserve, read `<project-root>/AGENTS.md`.
