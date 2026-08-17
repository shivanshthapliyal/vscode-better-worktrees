import { formatWorktreeLabel } from "./display";
import { Worktree } from "./types";

/**
 * The safety layer in front of `git worktree remove` and `git worktree prune`.
 * Pure, so the tree can ask the same questions when deciding which context menu
 * entries to show as the commands ask before acting — a row can never offer an
 * action the command would refuse.
 */

export interface RemovalContext {
  isMainWorktree: boolean;
  isCurrentWindow: boolean;
}

export type RemovalCheck =
  | { removable: true }
  | { removable: false; reason: string };

export interface RemovalPrompt {
  message: string;
  detail: string;
  requiresForce: boolean;
}

/**
 * Guards `git worktree remove`, which deletes a directory from disk and can
 * discard uncommitted work. Every refusal here is a case git would either
 * reject anyway or perform destructively without a second chance.
 */
export function checkWorktreeRemovable(
  worktree: Worktree,
  context: RemovalContext,
): RemovalCheck {
  if (context.isMainWorktree) {
    return {
      removable: false,
      reason:
        "This is the main worktree of the repository and cannot be removed.",
    };
  }

  if (worktree.isBare) {
    return {
      removable: false,
      reason: "Bare repositories cannot be removed as worktrees.",
    };
  }

  if (context.isCurrentWindow) {
    return {
      removable: false,
      reason:
        "This worktree is open in this window. Switch to another folder first, then remove it.",
    };
  }

  if (worktree.isLocked) {
    const because = worktree.lockReason ? ` (${worktree.lockReason})` : "";
    return {
      removable: false,
      reason: `This worktree is locked${because}. Unlock it before removing.`,
    };
  }

  if (worktree.isPrunable) {
    return {
      removable: false,
      reason:
        "This worktree is already stale on disk. Use Prune Worktrees to clear it.",
    };
  }

  return { removable: true };
}

export function describeRemoval(
  worktree: Worktree,
  dirtyCount: number,
): RemovalPrompt {
  const label = worktree.branch ?? formatWorktreeLabel(worktree);
  const requiresForce = dirtyCount > 0;

  const detail = requiresForce
    ? `${worktree.path}\n\n${dirtyCount} uncommitted ${
        dirtyCount === 1 ? "change" : "changes"
      } will be permanently lost.`
    : worktree.path;

  return {
    message: `Remove the worktree for "${label}"?`,
    detail,
    requiresForce,
  };
}

export type MoveCheck = { movable: true } | { movable: false; reason: string };

/**
 * Guards `git worktree move`. The first two refusals mirror git's own — it
 * rejects the main worktree outright and a locked one without a double
 * `--force` — so failing here produces a clearer message than git's. Refusing
 * the current window is this extension's addition: git would succeed and leave
 * the open folder pointing at a path that no longer exists.
 */
export function checkWorktreeMovable(
  worktree: Worktree,
  context: RemovalContext,
): MoveCheck {
  if (context.isMainWorktree) {
    return {
      movable: false,
      reason: "This is the main worktree of the repository and cannot be moved.",
    };
  }

  if (context.isCurrentWindow) {
    return {
      movable: false,
      reason:
        "This worktree is open in this window. Switch to another folder first, then move it.",
    };
  }

  if (worktree.isLocked) {
    const because = worktree.lockReason ? ` (${worktree.lockReason})` : "";
    return {
      movable: false,
      reason: `This worktree is locked${because}. Unlock it before moving.`,
    };
  }

  if (worktree.isPrunable) {
    return {
      movable: false,
      reason:
        "This worktree is already stale on disk, so there is nothing to move. Use Prune Worktrees to clear it.",
    };
  }

  return { movable: true };
}

/**
 * Whether a repository has anything for prune to clear. The tree gates the
 * inline prune icon on this: an always-visible destructive icon next to every
 * repository invites a click that does nothing, or worse becomes muscle memory.
 */
export function hasStaleWorktrees(worktrees: readonly Worktree[]): boolean {
  return worktrees.some((worktree) => worktree.isPrunable);
}

export interface StaleGroup<T> {
  group: T;
  stale: Worktree[];
}

/**
 * Narrows a set of repositories to those with stale entries, so pruning runs
 * only where it has something to do and the confirmation lists exactly what
 * will be cleared.
 */
export function selectStaleGroups<T extends { worktrees: readonly Worktree[] }>(
  groups: readonly T[],
): StaleGroup<T>[] {
  return groups
    .map((group) => ({
      group,
      stale: group.worktrees.filter((worktree) => worktree.isPrunable),
    }))
    .filter((entry) => entry.stale.length > 0);
}
