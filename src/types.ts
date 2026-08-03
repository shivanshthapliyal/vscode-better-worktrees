/**
 * Shapes shared across the extension. This module deliberately imports nothing,
 * so the pure modules that build on it stay testable without an editor stub.
 */

/** A single worktree, as reported by `git worktree list --porcelain`. */
export interface Worktree {
  path: string;
  head?: string;
  branch?: string;
  isBare: boolean;
  isDetached: boolean;
  isLocked: boolean;
  lockReason?: string;
  isPrunable: boolean;
  prunableReason?: string;
}

/** Uncommitted changes and upstream divergence for one worktree. */
export interface WorktreeStatus {
  dirtyCount: number;
  ahead: number;
  behind: number;
}

/**
 * Worktrees that share a `$GIT_COMMON_DIR` — that is, one repository and every
 * worktree linked to it. Renders as a single top-level row in the tree.
 */
export interface RepoGroup {
  commonDir: string;
  label: string;
  rootPath: string;
  worktrees: Worktree[];
}

/** Injected into pure modules so they can report without importing `vscode`. */
export interface WorktreeNotifications {
  info(message: string): void;
  warning(message: string): void;
  error(message: string, error?: unknown): void;
}
