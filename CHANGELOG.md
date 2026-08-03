# Changelog

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
