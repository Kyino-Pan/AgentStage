# Contributing

## Local development

```bash
cd <project-root>
npm start
```

Useful commands:

```bash
npm run daemon:status
npm run launchd:status
npm run skill:status
```

## Change guidelines

- Keep the shared wrapper minimal; the embedded page should remain the visual focus.
- Preserve the hot-update flow: registration must not require a server restart.
- Keep the project dependency-light.
- Prefer updating agent-facing docs when changing workflow rules.
- Do not commit local runtime state, logs, or private registry data.

## Before opening a PR

- Verify the relevant Node scripts pass `node --check`
- Verify the portal still loads at `http://127.0.0.1:4318`
- Verify `GET /healthz` and `GET /api/registry`
- If you changed skill behavior, update `skill/agentstage-portal/`
