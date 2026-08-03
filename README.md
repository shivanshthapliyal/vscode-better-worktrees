# Better Worktrees

A Worktrees view for the Explorer sidebar, for people who keep several git worktrees checked out at once.

## Why I built this

I usually have a handful of worktrees going at the same time — one per review, a couple of long-running experiments, a hotfix I had to jump on. After a while I could never remember which one had uncommitted work in it, or which one the window I was looking at was even open on. The Source Control view listed them all at once with no way to focus on one, so answering either question meant dropping into a terminal and running `git worktree list` for the tenth time that day.

So I built the view I wanted: every worktree in one place, its state visible at a glance, and the handful of things I actually do to them a click away. It doesn't create worktrees — my shell aliases already handle that — it just makes the ones I already have pleasant to live with.

## Features

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

## Notes

Worktree creation is deliberately out of scope — this manages the worktrees your existing tooling creates.

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
