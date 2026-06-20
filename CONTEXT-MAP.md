# Context Map

This is a multi-context monorepo. Each context owns its own `CONTEXT.md` glossary and ADRs. Read the context(s) relevant to what you're working on.

| Context     | Path                       | What it is                                              |
| ----------- | -------------------------- | ------------------------------------------------------- |
| **desktop** | `apps/desktop/CONTEXT.md`  | Tauri + Vite + TypeScript desktop app (the translator UI) |
| **server**  | `apps/server/CONTEXT.md`   | NestJS backend (translation API, GitHub auth, deploy via Dokploy) |

System-wide architectural decisions live in `docs/adr/`. Context-specific decisions live in `apps/<context>/docs/adr/`.

The per-context `CONTEXT.md` files are created lazily by `/domain-modeling` as domain terms get resolved — they may not exist yet.
