# Better Worktrees

A Worktrees view for the Explorer sidebar, for people who keep several git worktrees checked out at once.

Keeping several worktrees open at the same time makes two questions hard to answer without dropping into a terminal: which one has uncommitted work, and which one the current window is on. The Source Control view lists them all at once with no way to focus on a single one. This puts every worktree in one place, shows its state at a glance, and keeps the common actions a click away.

## Features

**Create a worktree without leaving the editor.** *New Worktree...* asks for a branch name, what to start it from, and where to put it. The destination is suggested from a template you control and shown for editing before anything is written, so worktrees land where you keep them rather than where the extension guessed. Branch names are validated by git itself, and slashes are flattened in the directory name so `feat/api` stays a single folder.

**See the state of every worktree.** Each row shows uncommitted change count, how far ahead or behind upstream it is, and a marker for the worktree the current window has open. Stale worktrees — ones git reports as prunable because their directory is gone — are flagged rather than shown as ordinary checkouts.

**Focus Source Control on one worktree.** Clicking a worktree narrows the Source Control view to just that repository, so the Changes list shows only the branch you care about. *Show All Worktrees in Source Control* brings the rest back.

**Open a worktree the way you need it.** Reveal it in the Explorer tree, add it to the workspace as an extra root so several sit side by side, open it in a new or current window, or open a terminal in it.

**Manage worktrees safely.** Removal is guarded: it refuses the main worktree, the one open in the current window, and locked ones, and a worktree with uncommitted changes needs explicit confirmation before anything is deleted. You can also lock and unlock with a reason, and prune stale entries.

## Requirements

- `git` on your `PATH`
- The built-in Git extension (`vscode.git`) enabled

## Installation

Download the `.vsix` from the [Releases page](https://github.com/shivanshthapliyal/vscode-better-worktrees/releases) and install it:

```bash
code --install-extension better-worktrees-<version>.vsix
```

Or from the editor: **Extensions → … → Install from VSIX**.

## Settings

| Setting | Default | Description |
|---|---|---|
| `betterWorktrees.showNotifications` | `true` | Show success notifications. Warnings and errors are always shown. |
| `betterWorktrees.openWorktreeIn` | `newWindow` | Where the open actions put a worktree. |
| `betterWorktrees.scanDepth` | `3` | How deep to search each workspace folder for git repositories. |
| `betterWorktrees.worktreePathTemplate` | `${repoPath}/../${repoName}-${branch}` | Where new worktrees are suggested. |

### Worktree location

`worktreePathTemplate` understands `${repoPath}`, `${repoName}` and `${branch}`. A leading `~` expands to your home directory, and a relative template resolves against the repository. The default puts a worktree beside the repo; to collect them all in one place instead:

```json
"betterWorktrees.worktreePathTemplate": "~/.worktrees/${repoName}/${branch}"
```

## Notes

Creation covers new branches only. Checking out an existing branch into a worktree, tracking a remote one, or a detached checkout are all still terminal jobs — the flow stays a single path rather than a mode picker.

The extension registers worktrees with the built-in Git extension through the `git.openRepository` command rather than the Git API method of the same name, because only the command reopens a repository that was previously closed. Narrowing the Source Control view works by closing the other repositories, since no API exists to select a repository row; every close is reversible through *Show All Worktrees in Source Control*.

## Development

```bash
npm install
npm test        # vitest
npm run lint
npm run compile
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

Modules that import `vscode` are the editor-facing ones: `extension`, `config`, `commands/`, `views/`, `repoManager`, `git/registry`, `notifications`, `prompts`, `logger`. Everything else is pure and tested without an editor stub.

## License

MIT
