import { existsSync } from "node:fs";
import path from "node:path";
import * as vscode from "vscode";
import { runCommand } from "../commandRunner";
import {
  moveWorktree,
  pruneWorktrees,
  removeWorktree,
  repairWorktrees,
  setWorktreeLock,
} from "../git/cli";
import { log } from "../logger";
import { showInfo, showWarning } from "../notifications";
import {
  checkWorktreeMovable,
  checkWorktreeRemovable,
  describeRemoval,
  selectStaleGroups,
} from "../removal";
import { WorktreeNode } from "../views/worktreeTree";
import { CommandContext } from "./context";

export function registerLifecycleCommands(
  ctx: CommandContext,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(
      "betterWorktrees.refreshWorktrees",
      runCommand(async () => {
        await ctx.repos.refresh();
      }),
    ),
    vscode.commands.registerCommand(
      "betterWorktrees.worktree.remove",
      runCommand(async (node?: WorktreeNode) => {
        await remove(ctx, node);
      }),
    ),
    vscode.commands.registerCommand(
      "betterWorktrees.worktree.toggleLock",
      runCommand(async (node?: WorktreeNode) => {
        await toggleLock(ctx, node);
      }),
    ),
    // A separate command only so the inline button on a locked row can carry an
    // open-padlock icon: an icon belongs to a command, not to a menu entry, and
    // a closed padlock there would read as the row's locked state rather than as
    // the action of unlocking it. The behaviour is the same toggle.
    vscode.commands.registerCommand(
      "betterWorktrees.worktree.unlockInline",
      runCommand(async (node?: WorktreeNode) => {
        await toggleLock(ctx, node);
      }),
    ),
    vscode.commands.registerCommand(
      "betterWorktrees.worktree.move",
      runCommand(async (node?: WorktreeNode) => {
        await move(ctx, node);
      }),
    ),
    vscode.commands.registerCommand(
      "betterWorktrees.pruneWorktrees",
      runCommand(async (node?: WorktreeNode) => {
        await prune(ctx, node);
      }),
    ),
    vscode.commands.registerCommand(
      "betterWorktrees.repairWorktrees",
      runCommand(async (node?: WorktreeNode) => {
        await repair(ctx, node);
      }),
    ),
  ];
}

async function remove(
  ctx: CommandContext,
  node: WorktreeNode | undefined,
): Promise<void> {
  if (node?.kind !== "worktree") {
    return;
  }

  const { worktree } = node;
  const check = checkWorktreeRemovable(worktree, {
    isMainWorktree: ctx.repos.isMainWorktree(worktree.path),
    isCurrentWindow: ctx.repos.isCurrentWindow(worktree.path),
  });
  if (!check.removable) {
    showWarning(`Worktrees: ${check.reason}`);
    return;
  }

  const status = ctx.repos.getStatus(worktree.path);
  const prompt = describeRemoval(worktree, status?.dirtyCount ?? 0);
  const confirmLabel = prompt.requiresForce ? "Delete Anyway" : "Remove";

  const choice = await vscode.window.showWarningMessage(
    prompt.message,
    { modal: true, detail: prompt.detail },
    confirmLabel,
  );
  if (choice !== confirmLabel) {
    return;
  }

  await removeWorktree(node.repo.rootPath, worktree.path, prompt.requiresForce);
  showInfo(`Worktrees: Removed worktree ${path.basename(worktree.path)}.`);
  await ctx.repos.refresh();
}

async function toggleLock(
  ctx: CommandContext,
  node: WorktreeNode | undefined,
): Promise<void> {
  if (node?.kind !== "worktree") {
    return;
  }

  const { worktree } = node;
  const locking = !worktree.isLocked;
  let reason: string | undefined;

  if (locking) {
    reason = await vscode.window.showInputBox({
      title: "Lock Worktree",
      prompt: "Optional reason for locking this worktree",
      placeHolder: "e.g. long-running build",
    });
    if (reason === undefined) {
      return;
    }
  }

  await setWorktreeLock(
    node.repo.rootPath,
    worktree.path,
    locking,
    reason?.trim() || undefined,
  );
  showInfo(
    `Worktrees: ${locking ? "Locked" : "Unlocked"} ${path.basename(
      worktree.path,
    )}.`,
  );
  await ctx.repos.refresh();
}

/**
 * Relocates a worktree through git, which rewrites the administrative files
 * recording where it lives. Moving the directory by hand instead leaves those
 * pointing at the old path, and git then reports the worktree as stale — a
 * state `repair` cannot fix without being told the new location.
 */
async function move(
  ctx: CommandContext,
  node: WorktreeNode | undefined,
): Promise<void> {
  if (node?.kind !== "worktree") {
    return;
  }

  const { worktree } = node;
  const check = checkWorktreeMovable(worktree, {
    isMainWorktree: ctx.repos.isMainWorktree(worktree.path),
    isCurrentWindow: ctx.repos.isCurrentWindow(worktree.path),
  });
  if (!check.movable) {
    showWarning(`Worktrees: ${check.reason}`);
    return;
  }

  const target = await vscode.window.showInputBox({
    title: "Move Worktree",
    prompt: "New path for this worktree",
    value: worktree.path,
    valueSelection: [worktree.path.lastIndexOf("/") + 1, worktree.path.length],
    validateInput: (value) => {
      const trimmed = value.trim();
      if (trimmed === "") {
        return "Enter a path.";
      }
      if (trimmed === worktree.path) {
        return "That is where the worktree already is.";
      }
      // Stricter than git on purpose: given an existing directory git treats it
      // as a parent and moves the worktree inside it, so `/tmp/a` silently
      // becomes `/tmp/a/<name>`. From a prompt asking for the new path, that is
      // not what was typed.
      return existsSync(trimmed) ? "That path already exists." : undefined;
    },
  });
  const destination = target?.trim();
  if (!destination || destination === worktree.path) {
    return;
  }

  await moveWorktree(node.repo.rootPath, worktree.path, destination);
  showInfo(`Worktrees: Moved to ${destination}.`);
  await ctx.repos.refresh();
}

/**
 * Prunes stale worktrees, scoped to one repository when invoked from a repo row
 * and across all of them from the view title. Each `git worktree prune` is
 * independent, so one repository failing does not abandon the rest.
 */
async function prune(
  ctx: CommandContext,
  node: WorktreeNode | undefined,
): Promise<void> {
  const repos = node?.kind === "repo" ? [node.repo] : ctx.repos.getRepos();
  const groups = selectStaleGroups(repos);
  const stale = groups.flatMap((entry) => entry.stale);

  if (stale.length === 0) {
    showInfo("Worktrees: No stale worktrees to prune.");
    return;
  }

  const plural = stale.length === 1 ? "" : "s";
  const choice = await vscode.window.showWarningMessage(
    `Prune ${stale.length} stale worktree${plural}?`,
    { modal: true, detail: stale.map((worktree) => worktree.path).join("\n") },
    "Prune",
  );
  if (choice !== "Prune") {
    return;
  }

  const failed: string[] = [];
  for (const { group } of groups) {
    try {
      await pruneWorktrees(group.rootPath);
    } catch (error) {
      failed.push(group.label);
      log(`Failed to prune ${group.rootPath}: ${String(error)}`);
    }
  }

  if (failed.length > 0) {
    showWarning(
      `Worktrees: Could not prune ${failed.join(
        ", ",
      )}. See the Better Worktrees output for details.`,
    );
  } else {
    showInfo(`Worktrees: Pruned ${stale.length} stale worktree${plural}.`);
  }
  await ctx.repos.refresh();
}

/**
 * Re-points worktrees at their repository after the repository was moved or
 * renamed on disk. Unlike prune this destroys nothing — it only rewrites
 * administrative paths — so it runs without a confirmation, and it is a no-op on
 * a repository that turns out to need nothing.
 *
 * The notification distinguishes those two outcomes: git reports each file it
 * fixed and says nothing when there was no damage, and reporting "repaired" for
 * a healthy repository would suggest a problem had been found.
 */
async function repair(
  ctx: CommandContext,
  node: WorktreeNode | undefined,
): Promise<void> {
  const repos = node?.kind === "repo" ? [node.repo] : ctx.repos.getRepos();
  if (repos.length === 0) {
    showWarning("Worktrees: No git repository found in this workspace.");
    return;
  }

  const failed: string[] = [];
  const repaired: string[] = [];
  for (const repo of repos) {
    try {
      const report = await repairWorktrees(repo.rootPath);
      if (report !== "") {
        repaired.push(repo.label);
        log(`Repaired ${repo.rootPath}: ${report}`);
      }
    } catch (error) {
      failed.push(repo.label);
      log(`Failed to repair ${repo.rootPath}: ${String(error)}`);
    }
  }

  if (failed.length > 0) {
    showWarning(
      `Worktrees: Could not repair ${failed.join(
        ", ",
      )}. See the Better Worktrees output for details.`,
    );
  } else if (repaired.length === 0) {
    showInfo("Worktrees: Nothing needed repairing.");
  } else {
    showInfo(`Worktrees: Repaired worktree links in ${repaired.join(", ")}.`);
  }
  await ctx.repos.refresh();
}
