# drfr-translation-tool

A monorepo for the Deltarune FR translation tool. Two packages:

- **`apps/desktop/`** — Tauri + Vite + TypeScript desktop application (the translator UI). Builds cross-platform via `.github/workflows/build.yml`, released as GitHub Releases tagged `app-v<version>`.
- **`apps/server/`** — NestJS backend (translation API, GitHub auth). Deployed via Dokploy, which auto-redeploys on push to `main` with build root `apps/server`.

Each package keeps its own `package.json`, lockfile, `node_modules`, and tooling (loose monorepo — no root workspace). Run commands from within each package directory.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (`gh` CLI); external PRs are **not** a triage surface. Issues describe end-to-end vertical slices that may span both packages. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context — `CONTEXT-MAP.md` at the root points to a per-package `CONTEXT.md`. See `docs/agents/domain.md`.
