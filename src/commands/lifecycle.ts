import path from "node:path";
import * as vscode from "vscode";
import { runCommand } from "../commandRunner";
import {
  pruneWorktrees,
  removeWorktree,
  setWorktreeLock,
} from "../git/cli";
import { log } from "../logger";
import { showInfo, showWarning } from "../notifications";
import {
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
    vscode.commands.registerCommand(
      "betterWorktrees.pruneWorktrees",
      runCommand(async (node?: WorktreeNode) => {
        await prune(ctx, node);
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
