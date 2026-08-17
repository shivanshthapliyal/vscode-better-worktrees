import path from "node:path";
import { formatWorktreeLabel } from "./display";
import { Worktree, WorktreeNotifications } from "./types";

/**
 * Everything this extension does to the Source Control view: registering
 * worktrees into it, narrowing it to one, and restoring it. Written against
 * injected dependencies rather than the git extension directly, so the
 * behaviour is testable without an editor.
 */

export interface ScopeSourceControlDependencies {
  listRegisteredRepositories(): Promise<string[]>;
  openRepository(fsPath: string): Promise<boolean>;
  closeRepository(fsPath: string): Promise<void>;
  notifications: WorktreeNotifications;
}

export interface AddWorktreesDependencies {
  listWorktrees(cwd: string): Promise<Worktree[]>;
  openRepository(fsPath: string): Promise<boolean>;
  notifications: WorktreeNotifications;
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}

export function getWorktreePathsToRegister(
  worktrees: readonly Worktree[],
): string[] {
  return worktrees.filter((worktree) => !worktree.isBare).map((w) => w.path);
}

/**
 * Narrows the Source Control view to a single worktree.
 *
 * The editor exposes no way to select or reveal a repository row, so the only
 * lever that changes which repository the Changes view renders is closing the
 * others. We close them one by one against the exact roots reported by the git
 * extension rather than using `git.closeOtherRepositories`, whose argument is
 * resolved by longest-path-prefix match and can therefore misresolve a linked
 * worktree and close everything.
 *
 * Returns the paths that were closed so the caller can restore them, or null
 * when the target itself could not be registered.
 */
export async function scopeSourceControlToWorktree(
  targetPath: string,
  deps: ScopeSourceControlDependencies,
): Promise<string[] | null> {
  if (!(await deps.openRepository(targetPath))) {
    deps.notifications.warning(
      "Worktrees: Could not open this worktree in Source Control.",
    );
    return null;
  }

  const registered = await deps.listRegisteredRepositories();
  const others = registered.filter(
    (repoPath) => !samePath(repoPath, targetPath),
  );

  for (const other of others) {
    await deps.closeRepository(other);
  }

  return others;
}

/**
 * Registers one worktree in the Source Control view without touching what is
 * already there, so the view accumulates worktrees instead of being narrowed to
 * one. The counterpart to {@link scopeSourceControlToWorktree}, which gets its
 * result by closing everything else.
 *
 * A worktree the extension itself scoped out is still remembered as closed by
 * the caller. Reporting whether registration happened lets it drop that entry,
 * or the next restore would reopen a repository that is already open.
 */
export async function addWorktreeToSourceControl(
  worktree: Worktree,
  deps: ScopeSourceControlDependencies,
): Promise<boolean> {
  if (worktree.isBare) {
    deps.notifications.warning(
      "Worktrees: A bare repository has no working copy to show in Source Control.",
    );
    return false;
  }

  const registered = await deps.listRegisteredRepositories();
  const already = registered.some((repoPath) =>
    samePath(repoPath, worktree.path),
  );
  const label = formatWorktreeLabel(worktree);

  if (already) {
    deps.notifications.info(
      `Worktrees: ${label} is already in the Source Control view.`,
    );
    return false;
  }

  if (!(await deps.openRepository(worktree.path))) {
    deps.notifications.warning(
      "Worktrees: Could not add this worktree to Source Control.",
    );
    return false;
  }

  deps.notifications.info(
    `Worktrees: Added ${label} to the Source Control view.`,
  );
  return true;
}

/**
 * Reopens repositories previously closed by {@link scopeSourceControlToWorktree}.
 * Reopening only works because the caller routes through the `git.openRepository`
 * command, which forces past the closed-repository gate; the Git API method of
 * the same name does not.
 */
export async function restoreSourceControlScope(
  paths: readonly string[],
  deps: ScopeSourceControlDependencies,
): Promise<number> {
  const unique = new Map<string, string>();
  for (const fsPath of paths) {
    unique.set(path.resolve(fsPath), fsPath);
  }

  let restored = 0;
  for (const fsPath of unique.values()) {
    if (await deps.openRepository(fsPath)) {
      restored += 1;
    }
  }

  return restored;
}

export async function addWorktreesToSourceControl(
  cwd: string,
  deps: AddWorktreesDependencies,
): Promise<void> {
  const worktrees = await deps.listWorktrees(cwd);

  if (worktrees.length === 0) {
    deps.notifications.warning(
      "Worktrees: No git worktrees found for this folder.",
    );
    return;
  }

  const paths = getWorktreePathsToRegister(worktrees);
  let added = 0;
  for (const worktreePath of paths) {
    if (await deps.openRepository(worktreePath)) {
      added += 1;
    }
  }

  if (added === 0) {
    deps.notifications.warning(
      "Worktrees: Could not add any worktrees to Source Control.",
    );
    return;
  }

  const suffix = added === 1 ? "worktree" : "worktrees";
  deps.notifications.info(
    `Worktrees: Added ${added} ${suffix} to the Source Control view.`,
  );
}
