# Flatten pathsInGameFolder.windows to an OS-neutral pathInGameFolder (breaking change)

The server↔desktop translation-files contract returned `pathsInGameFolder: { windows: string }`, an OS-keyed map that only ever held a single Windows path. Adding Linux support — which reuses the identical Proton/Windows game layout — made the OS key meaningless, so we collapsed it to a flat, OS-neutral `pathInGameFolder: string`, symmetric with the existing sibling `pathInGitFolder`. We ship this as a hard breaking change with no compatibility shim.

## Considered Options

- **Additive dual-emit** (server returns both old and new fields for a transition) and **adding a Tauri auto-updater before renaming** — both rejected as not worth the cost given a small, coordinated translator base and no existing auto-update mechanism.

## Consequences

- Any desktop release older than this one stops loading translation files once the server deploys the renamed contract, so the server change and a new desktop release must be announced and rolled out together.
- Touches both contexts: server (`translation-files.ts` type + data, controller passthrough, spec) and desktop (the response zod schemas, the translation type, and the patch flow that reads the field).
