---
name: "agentstage-portal"
description: "Use when the user wants a brand-new static HTML page prepared for the shared AgentStage portal without modifying or deleting any existing files."
---

# AgentStage Portal

## When to use

- The user wants a report, dashboard, prototype, comparison, or summary shown as a webpage.
- The task is to create a brand-new static page, not to edit or replace an existing one.
- The page should be prepared for the shared AgentStage navigation instead of a one-off local server.
- Invoking this skill means the default goal is that the resulting page becomes visible in the shared portal at `http://127.0.0.1:4318`.

Important completion rule:

- Treat invocation of this skill itself as sufficient evidence that the default desired outcome is visibility in the running portal.
- Creating the HTML file is therefore only phase 1 unless the user explicitly asked for file-only output, explicit handoff, or explicitly said not to register.
- In that case, after the create-only phase finishes, the agent must immediately leave the skill phase and complete registration through the normal non-skill workflow.
- Do not stop at "here is the registration command" unless the user explicitly asked for handoff only or explicitly said not to register.

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

This means:

- create-only is a constraint on the page-generation phase
- it is not permission to abandon an end-to-end user request halfway through
- invoking this skill defaults to portal visibility on `http://127.0.0.1:4318`
- the agent must continue after the skill with normal registration steps unless the user explicitly opted out

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
4. By default, treat the new page as something that must become visible in AgentStage at `http://127.0.0.1:4318`.
5. If the user explicitly asked for page creation only, hand off the new page path and suggested registration command.
6. Otherwise, immediately switch to a normal non-skill workflow and perform registration yourself. Do not wait for the user to repeat the request.

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

## Registration follow-up

- Registration is outside this skill because it mutates portal runtime files.
- Outside this skill does not mean "leave it undone". Because invoking this skill defaults to `4318` visibility, registration must happen in the immediate follow-up non-skill phase unless the user explicitly opted out.
- If the user explicitly wants handoff only, or explicitly asks what command to run themselves, hand them one of these separate commands:
  - `node scripts/register-page.mjs --server http://127.0.0.1:4318 --user-id "<project-or-project/subproject>" --user-name "<project-or-project/subproject>" --workspace-root /absolute/path/to/workspace --source-root /absolute/path/to/workspace/out --page "Page Title" --entry /absolute/path/to/workspace/out/index.html`
  - `POST /api/register`
- Otherwise, use one of these mechanisms yourself in the immediate follow-up non-skill phase and complete registration for the user.
- For repeatable handoffs, use `<project-root>/templates/page.manifest.example.json` as the starting schema.

## Not allowed from this skill

- Runtime operations such as `npm start`, `npm run daemon:start`, `npm run bootstrap:machine`, and `npm run launchd:install`
- Registry repair or backup manipulation
- Default-constraint descriptor updates
- Existing page edits, replacements, deletions, or re-registration

## Read more only when needed

- For architecture, API routes, runtime commands, and troubleshooting, read `<project-root>/README_AGENT.md`.
- For portal rules that future agents should preserve, read `<project-root>/AGENTS.md`.
