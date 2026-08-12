# Better Worktrees

Git worktrees in the Explorer sidebar — create, inspect, and switch between them without touching a terminal.

Worktrees let you keep several branches checked out at once, but the editor gives you little to manage them with. Two questions in particular are hard to answer at a glance: which worktree has uncommitted work, and which one the current window is actually on. The built-in Source Control view lists them all at once with no way to focus. Better Worktrees puts every worktree in one place, surfaces its state inline, and keeps the common actions one click away.

## At a glance

The **Worktrees** view sits in the Explorer sidebar, grouped by repository. Each row shows its state inline, is tinted by branch type, and a right-click opens the full set of actions.

<video src="https://github.com/shivanshthapliyal/vscode-better-worktrees/raw/main/docs/worktree-demo.mp4" controls muted loop playsinline poster="docs/worktrees-view.png" width="900"></video>

> If the video does not play, [watch the demo](https://github.com/shivanshthapliyal/vscode-better-worktrees/raw/main/docs/worktree-demo.mp4) or see the annotated view below.

![The Worktrees view in the Explorer sidebar: worktrees coloured by branch type — feature, fix, release, chore, and untyped — each showing its uncommitted-change count and ahead/behind badges, with one locked and the current window marked](docs/worktrees-view.png)

Every row tells you what you need without opening it:

- **Colour by branch type** — feature branches are blue, fixes red, releases purple, chores green, `main`/`master` slate, and anything unrecognised a shade of orange, so you scan the list by kind. (Switch to a distinct hashed colour per branch with `betterWorktrees.colorMode`.)
- **`● main` — current** — the green dot marks the worktree the active window has open.
- **`3●`** — three uncommitted changes; **`↑2` / `↓2`** — commits ahead of / behind upstream.
- **`🔒 locked`** — a locked worktree, protected from removal.
- **`⚠ stale`** — git reports the directory as gone; prune it to clean up.
- The muted text on the right is the location — relative to the repo when it lives inside it, home-shortened otherwise.

Click any row to focus the Source Control view on that worktree; right-click for the full action menu — check out a branch or pull request, fetch and pull, open, copy, lock, or remove.

## Features

- **Create without leaving the editor.** *New Worktree...* walks through a branch name, a start point, and a destination. The destination is suggested from a template you control and shown for editing before anything is written, so worktrees land where you keep them. Branch names are validated by git itself, and slashes are flattened in the directory name so `feat/api` stays a single folder.
- **Check out what already exists.** *Checkout Branch as Worktree...* lists your local and remote-tracking branches — skipping any already checked out in a worktree — and creates a worktree on the one you pick. *Worktree from Pull Request...* uses the GitHub CLI's `gh pr checkout` to pull down a PR, including cross-fork ones, into its own worktree.
- **Keep a worktree current.** Right-click for *Fetch* (all remotes, pruning gone branches) and *Pull* (fast-forward only, so it never opens a merge), each scoped to that worktree and reflected in its status the moment it finishes.
- **Find and prioritise.** A search icon in the view title filters the tree by a branch or path fragment; a title toggle sorts worktrees with uncommitted changes to the top so the ones with work in progress are always in view.
- **See every worktree's state at a glance.** Each row shows its uncommitted change count, how far it is ahead of or behind upstream, and a marker for the worktree the current window has open. Stale worktrees — ones git reports as prunable because their directory is gone — are flagged rather than shown as ordinary checkouts.
- **Focus Source Control on one worktree.** Click a worktree to narrow the Source Control view to just that repository, so the Changes list shows only the branch you care about. *Show All Worktrees in Source Control* brings the rest back.
- **Open a worktree the way you need it.** Reveal it in the Explorer tree or your file manager, add it to the workspace as an extra root, open it in a new or current window, or drop a terminal into it. Copy its path or branch name in a click.
- **Remove safely.** Removal refuses the main worktree, the one open in the current window, and locked ones; a worktree with uncommitted changes needs explicit confirmation before anything is deleted. Lock and unlock with a reason, and prune stale entries when you're ready.

## Requirements

- `git` available on your `PATH`
- The built-in Git extension (`vscode.git`) enabled
- Optionally, the [GitHub CLI](https://cli.github.com) (`gh`) on your `PATH` — only for *Worktree from Pull Request...*

## Installation

Download the latest `.vsix` from the [Releases page](https://github.com/shivanshthapliyal/vscode-better-worktrees/releases) and install it from the command line:

```bash
code --install-extension better-worktrees-<version>.vsix
```

Or from the editor: **Extensions → ⋯ → Install from VSIX…**

## Usage

The **Worktrees** view appears in the Explorer sidebar and groups worktrees by repository. From there you can:

- click **New Worktree…** in the view title to create one, or open the title menu for **Checkout Branch as Worktree…** and **Worktree from Pull Request…**
- click the **search** icon in the view title to filter by branch or path; it becomes a clear-filter button while a filter is active
- click a worktree row to focus the Source Control view on it
- right-click a worktree for the full set of fetch, pull, open, workspace, copy, lock, and remove actions

All commands are also available from the Command Palette under the **Worktrees:** category.

## Settings

| Setting | Default | Description |
|---|---|---|
| `betterWorktrees.showNotifications` | `true` | Show success notifications. Warnings and errors are always shown. |
| `betterWorktrees.openWorktreeIn` | `newWindow` | Where the open actions put a worktree — `newWindow` or `currentWindow`. |
| `betterWorktrees.scanDepth` | `3` | How many directory levels deep to search each workspace folder for git repositories. `0` scans only the folder root. `node_modules`, `dist`, `.venv`, and similar directories are always skipped. |
| `betterWorktrees.worktreePathTemplate` | `${repoPath}/../${repoName}-${branch}` | Where new worktrees are suggested (see below). |
| `betterWorktrees.colorMode` | `branch` | How worktree folders are coloured — `branch` (a distinct hashed colour per branch) or `branchType` (a colour per branch kind; see below). |
| `betterWorktrees.branchTypeMap` | `{}` | Overrides for the branch-prefix → type mapping used in `branchType` mode. Merged over the built-in defaults. |
| `betterWorktrees.sortDirtyFirst` | `false` | Sort worktrees with uncommitted changes ahead of clean ones. Toggle from the view title. |

### Colouring worktrees

Worktree folders are tinted in the Explorer so you can tell at a glance which one a file belongs to. Two modes:

- **`branch`** (default) — each branch gets its own stable colour, hashed from the branch name across a 20-colour palette (`betterWorktrees.worktreeColor1`–`20`). Different branches are easy to tell apart; the colour carries no meaning.
- **`branchType`** — colour by the branch's *kind*, so every feature branch is one colour, every fix another. A branch is split on `/`, `-`, `_`, and `.`, and **every** token is matched (case-insensitively) through `branchTypeMap`. This means the type keyword is found even when the branch is prefixed by an author or workflow — `user/login-crash-fix` reads as **fix**, `bot/release-1.2` as **release**. When more than one type matches, precedence is `fix` > `release` > `feature` > `chore` > `main`. Six types, each with its own themeable colour:

  | Type | Colour | Default keywords |
  |---|---|---|
  | `main` | slate — `betterWorktrees.worktreeTypeMain` | `main`, `master`, `develop`, `trunk` |
  | `feature` | blue — `betterWorktrees.worktreeTypeFeature` | `feat`, `feature` |
  | `fix` | red — `betterWorktrees.worktreeTypeFix` | `fix`, `bugfix`, `hotfix`, `bug`, `patch` |
  | `release` | purple — `betterWorktrees.worktreeTypeRelease` | `release`, `rel`, `rc` |
  | `chore` | green — `betterWorktrees.worktreeTypeChore` | `chore`, `refactor`, `docs`, `test`, `ci`, `build`, `deps`, `style`, `perf` |
  | `other` | a shade of orange | *(nothing matched)* |

  Unrecognised branches don't all get the same colour: they hash across eight shades of orange (`betterWorktrees.worktreeTypeOther1`–`8`), so they read as one family — "untyped" — while staying distinguishable from each other.

Add or remap prefixes without touching the defaults — for example, to treat `wip/` as a chore and `epic/` as a feature:

```json
"betterWorktrees.colorMode": "branchType",
"betterWorktrees.branchTypeMap": { "wip": "chore", "epic": "feature" }
```

Every colour above (both palettes) is themeable through `workbench.colorCustomizations`.

### Where new worktrees go

`worktreePathTemplate` accepts three placeholders:

| Placeholder | Expands to |
|---|---|
| `${repoPath}` | Absolute path of the repository |
| `${repoName}` | The repository's directory name |
| `${branch}` | The new branch, with slashes flattened to hyphens so it stays a single directory |

A leading `~` expands to your home directory, and a relative template resolves against the repository. The default places each worktree beside its repo. To collect them all under one directory instead:

```json
"betterWorktrees.worktreePathTemplate": "~/.worktrees/${repoName}/${branch}"
```

The suggestion is always shown and editable before anything is created — the template only sets the starting point.

## Notes

Creation covers **new branches only**. Checking out an existing branch into a worktree, tracking a remote one, or a detached checkout remain terminal jobs; keeping creation to a single path avoids turning the flow into a mode picker.

Checkout skips branches already in a worktree because git refuses to check the same branch out twice; the ones it hides are the ones the command could not act on anyway. *Worktree from Pull Request...* creates the worktree detached and lets `gh pr checkout` switch it to the PR branch, which is how gh reaches PRs from forks and remotes that raw `git worktree add` cannot; if the checkout fails the worktree is removed so a failed attempt leaves nothing behind. *Pull* is fast-forward only on purpose — a merge or rebase from a menu, with no diff in front of you, is the kind of thing that is better done deliberately in a terminal.

The extension registers worktrees with the built-in Git extension through the `git.openRepository` *command* rather than the Git API method of the same name, because only the command reopens a repository that was previously closed. Narrowing the Source Control view works by closing the other repositories, since there is no API to select a repository row — every close is reversible through *Show All Worktrees in Source Control*.

## Development

```bash
npm install
npm test        # vitest
npm run lint    # eslint
npm run compile # tsc
npm run package # produces a .vsix
```

### Project layout

```
src/
  extension.ts    activation and wiring, no logic of its own
  types.ts        shared shapes, imports nothing
  config.ts       every setting, read in one place
  display.ts      labels, badges, paths, sort order
  worktreePath.ts where a new worktree goes, template expansion
  removal.ts      the safety rules for remove and prune
  repoManager.ts  what worktrees exist, plus the file watcher
  git/            cli.ts (git invocations), porcelain.ts (parsing),
                  discovery.ts (repo scan), registry.ts (Source Control)
  commands/       one module per group of commands
  views/          tree and file decorations
```

Modules that import `vscode` are the editor-facing ones: `extension`, `config`, `commands/`, `views/`, `repoManager`, `git/registry`, `notifications`, `prompts`, and `logger`. Everything else is pure and tested without an editor stub. Git is always invoked through `execFile` with an argument array — never a shell string — and destructive subcommands place `--` before path operands, so nothing in a path or branch name can be misread as a flag.

## License

MIT © Shivansh Thapliyal
