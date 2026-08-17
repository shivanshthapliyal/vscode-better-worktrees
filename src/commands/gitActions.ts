import path from "node:path";
import * as vscode from "vscode";
import { runCommand } from "../commandRunner";
import {
  fetchWorktree,
  hasUpstream,
  pullWorktree,
  pushWorktree,
} from "../git/cli";
import { showInfo, showWarning } from "../notifications";
import { WorktreeNode, worktreePathFromNode } from "../views/worktreeTree";
import { CommandContext } from "./context";

/**
 * Git actions scoped to one worktree: fetch, fast-forward pull, and push. All
 * run in the worktree's own directory so they act on that checkout, and all
 * refresh the view afterwards so status badges reflect the new state.
 */
export function registerGitActionCommands(
  ctx: CommandContext,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(
      "betterWorktrees.worktree.fetch",
      runCommand(async (node?: WorktreeNode) => {
        const fsPath = worktreePathFromNode(node);
        if (!fsPath) {
          return;
        }
        await fetchWorktree(fsPath);
        await ctx.repos.refresh();
        showInfo(`Worktrees: Fetched ${path.basename(fsPath)}.`);
      }),
    ),
    vscode.commands.registerCommand(
      "betterWorktrees.worktree.pull",
      runCommand(async (node?: WorktreeNode) => {
        const fsPath = worktreePathFromNode(node);
        if (!fsPath) {
          return;
        }
        await pullWorktree(fsPath);
        await ctx.repos.refresh();
        showInfo(`Worktrees: Pulled ${path.basename(fsPath)}.`);
      }),
    ),
    vscode.commands.registerCommand(
      "betterWorktrees.worktree.push",
      runCommand(async (node?: WorktreeNode) => {
        await push(ctx, node);
      }),
    ),
  ];
}

/**
 * Pushes a worktree's branch, establishing the upstream on the first push. The
 * view shows an `↑n` badge for unpushed commits, so this closes that loop
 * without leaving the tree.
 */
async function push(
  ctx: CommandContext,
  node: WorktreeNode | undefined,
): Promise<void> {
  if (node?.kind !== "worktree") {
    return;
  }

  const { worktree } = node;
  if (!worktree.branch) {
    showWarning(
      "Worktrees: This worktree has a detached HEAD, so there is no branch to push.",
    );
    return;
  }

  // Only pass the branch when there is no upstream: git refuses a bare push in
  // that case, which is the norm for a branch this extension just created.
  const upstream = await hasUpstream(worktree.path);
  await pushWorktree(worktree.path, upstream ? undefined : worktree.branch);
  await ctx.repos.refresh();
  showInfo(`Worktrees: Pushed ${worktree.branch}.`);
}
