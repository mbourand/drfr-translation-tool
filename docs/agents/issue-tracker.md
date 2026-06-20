# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues on `mbourand/drfr-translation-tool`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Monorepo note

This is a multi-package monorepo (`apps/desktop` = Tauri desktop app, `apps/server` = NestJS backend). A single feature often spans both packages — that's the whole reason for the monorepo. Issues are not split per-package; one issue describes the end-to-end vertical slice across whichever packages it touches. Prefix the title with the package(s) when it helps (e.g. `[desktop]`, `[server]`, `[desktop+server]`).

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
