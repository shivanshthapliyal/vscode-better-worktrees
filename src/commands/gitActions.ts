import path from "node:path";
import * as vscode from "vscode";
import { runCommand } from "../commandRunner";
import { fetchWorktree, pullWorktree } from "../git/cli";
import { showInfo } from "../notifications";
import { WorktreeNode, worktreePathFromNode } from "../views/worktreeTree";
import { CommandContext } from "./context";

/**
 * Git actions scoped to one worktree: fetch and fast-forward pull. Both run in
 * the worktree's own directory so they act on that checkout, and both refresh
 * the view afterwards so status badges reflect the new state.
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
  ];
}
