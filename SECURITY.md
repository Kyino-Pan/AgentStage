# Security Policy

## Scope

AgentStage is primarily intended for localhost use on a trusted machine.

The main risks are:

- serving untrusted HTML or JavaScript from local workspaces
- exposing the local portal outside `127.0.0.1`
- accidentally publishing sensitive local paths or content in registry/backups

## Reporting

If you discover a security issue, do not open a public exploit issue first.

Preferred report contents:

- affected version or commit
- reproduction steps
- impact assessment
- suggested mitigation if known

## Hardening notes

- Keep the service bound to `127.0.0.1` unless you have reviewed the implications.
- Do not mount untrusted content.
- Treat `data/registry.json`, `runtime/`, and `backups/` as local operational data.
- Review generated HTML before sharing screenshots or recordings publicly.
