# Better Worktrees

Git worktrees in the Explorer sidebar — create, inspect, and switch between them without touching a terminal.

Worktrees let you keep several branches checked out at once, but the editor gives you little to manage them with. Two questions in particular are hard to answer at a glance: which worktree has uncommitted work, and which one the current window is actually on. The built-in Source Control view lists them all at once with no way to focus. Better Worktrees puts every worktree in one place, surfaces its state inline, and keeps the common actions one click away.

## Features

- **Create without leaving the editor.** *New Worktree...* walks through a branch name, a start point, and a destination. The destination is suggested from a template you control and shown for editing before anything is written, so worktrees land where you keep them. Branch names are validated by git itself, and slashes are flattened in the directory name so `feat/api` stays a single folder.
- **See every worktree's state at a glance.** Each row shows its uncommitted change count, how far it is ahead of or behind upstream, and a marker for the worktree the current window has open. Stale worktrees — ones git reports as prunable because their directory is gone — are flagged rather than shown as ordinary checkouts.
- **Focus Source Control on one worktree.** Click a worktree to narrow the Source Control view to just that repository, so the Changes list shows only the branch you care about. *Show All Worktrees in Source Control* brings the rest back.
- **Open a worktree the way you need it.** Reveal it in the Explorer tree or your file manager, add it to the workspace as an extra root, open it in a new or current window, or drop a terminal into it. Copy its path or branch name in a click.
- **Remove safely.** Removal refuses the main worktree, the one open in the current window, and locked ones; a worktree with uncommitted changes needs explicit confirmation before anything is deleted. Lock and unlock with a reason, and prune stale entries when you're ready.

## Requirements

- `git` available on your `PATH`
- The built-in Git extension (`vscode.git`) enabled

## Installation

Download the latest `.vsix` from the [Releases page](https://github.com/shivanshthapliyal/vscode-better-worktrees/releases) and install it from the command line:

```bash
code --install-extension better-worktrees-<version>.vsix
```

Or from the editor: **Extensions → ⋯ → Install from VSIX…**

## Usage

The **Worktrees** view appears in the Explorer sidebar and groups worktrees by repository. From there you can:

- click **New Worktree…** in the view title to create one
- click a worktree row to focus the Source Control view on it
- right-click a worktree for the full set of open, workspace, copy, lock, and remove actions

All commands are also available from the Command Palette under the **Worktrees:** category.

## Settings

| Setting | Default | Description |
|---|---|---|
| `betterWorktrees.showNotifications` | `true` | Show success notifications. Warnings and errors are always shown. |
| `betterWorktrees.openWorktreeIn` | `newWindow` | Where the open actions put a worktree — `newWindow` or `currentWindow`. |
| `betterWorktrees.scanDepth` | `3` | How many directory levels deep to search each workspace folder for git repositories. `0` scans only the folder root. `node_modules`, `dist`, `.venv`, and similar directories are always skipped. |
| `betterWorktrees.worktreePathTemplate` | `${repoPath}/../${repoName}-${branch}` | Where new worktrees are suggested (see below). |

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
