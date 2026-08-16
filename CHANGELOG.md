# Changelog

## 0.4.1

- First release on the Open VSX Registry, so the extension installs from the Extensions view in Cursor instead of from a downloaded `.vsix`
- Packaging no longer includes nested worktree checkouts, cutting the published package from 28 MB to 79 KB

## 0.4.0

- Check out an existing branch into a worktree: *Checkout Branch as Worktree...* lists local and remote-tracking branches, skips ones already checked out elsewhere, and creates a worktree on the one you pick
- Create a worktree from a GitHub pull request: *Worktree from Pull Request...* runs `gh pr checkout` in a fresh worktree, handling cross-fork and remote PRs. Degrades to a clear message when the GitHub CLI is not installed, and cleans up the worktree if the checkout fails
- Per-worktree git actions in the context menu: *Fetch* (`--all --prune`) and *Pull* (fast-forward only), each acting on that worktree and refreshing its status
- Filter the view: a search icon in the title filters rows by a branch or path substring; the icon flips to a clear-filter button while a filter is active
- Dirty-first sort: an optional order (`betterWorktrees.sortDirtyFirst`, toggled from the title) that surfaces worktrees with uncommitted changes ahead of clean ones

## 0.3.0

- Colour worktrees by branch type: set `betterWorktrees.colorMode` to `branchType` to give every feature, fix, release, etc. branch its own colour instead of a per-branch hash. The type keyword is detected anywhere in the name, so author- or workflow-prefixed branches like `user/login-crash-fix` still classify correctly
- The keyword → type mapping is configurable via `betterWorktrees.branchTypeMap`, merged over sensible defaults
- Semantic type colours — feature (blue), fix (red), release (purple), chore (green), main (slate) — plus eight shades of orange for unrecognised branches, so untyped worktrees are a distinguishable family rather than one flat colour
- Wider hash palette: `branch` mode now spreads across 20 colours instead of 8, so distinct branches are far less likely to share a colour
- Extension icon added
- Decorations now repaint immediately when the colour mode or map changes, without waiting for a worktree change

## 0.2.1

- Fix worktree status colours flickering: refreshes now repaint only when a worktree's status actually changed, and the filesystem watcher no longer reacts to git's own inner index writes

## 0.2.0

- Create a worktree from the view: *New Worktree...* prompts for a branch, a start point, and a destination
- Destination is suggested from `betterWorktrees.worktreePathTemplate` (`${repoPath}`, `${repoName}`, `${branch}`) and shown for editing before anything is written
- Branch names validated by `git check-ref-format`; slashes flattened to a single path segment
- New worktree is opened only when asked, not automatically

## 0.1.0

Initial release.

- Worktrees view in the Explorer, grouped by repository
- Per-worktree status: uncommitted change count, ahead/behind upstream, current-window marker
- Stale (prunable) worktrees flagged with their reason
- Click a worktree to narrow the Source Control view to it; restore with *Show All Worktrees in Source Control*
- Show in Explorer View, add to / remove from workspace, open in new or current window
- Open a terminal at a worktree; copy its path or branch name
- Remove a worktree, guarded against the main worktree, the current window's worktree, and locked worktrees, with explicit confirmation when uncommitted changes would be lost
- Lock and unlock worktrees with an optional reason
- Prune stale worktrees
- Automatic refresh when worktrees are added or removed
