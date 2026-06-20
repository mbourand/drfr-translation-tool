# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — this is a multi-context monorepo, so the map points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — system-wide architectural decisions.
- **`apps/<context>/docs/adr/`** — context-scoped decisions for that package.

If any of these files don't exist yet, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill creates them lazily when terms or decisions actually get resolved.

## File structure (multi-context)

```
/
├── CONTEXT-MAP.md                     ← points to each context's CONTEXT.md
├── docs/adr/                          ← system-wide decisions
└── apps/
    ├── desktop/                       ← Tauri desktop app context
    │   ├── CONTEXT.md
    │   └── docs/adr/
    └── server/                        ← NestJS backend context
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding.
