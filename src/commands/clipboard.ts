import * as vscode from "vscode";
import { runCommand } from "../commandRunner";
import { showInfo, showWarning } from "../notifications";
import { WorktreeNode, worktreePathFromNode } from "../views/worktreeTree";

export function registerClipboardCommands(): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(
      "betterWorktrees.worktree.copyPath",
      runCommand(async (node?: WorktreeNode) => {
        const fsPath = worktreePathFromNode(node);
        if (fsPath) {
          await vscode.env.clipboard.writeText(fsPath);
          showInfo("Worktrees: Copied worktree path to clipboard.");
        }
      }),
    ),
    vscode.commands.registerCommand(
      "betterWorktrees.worktree.copyBranch",
      runCommand(async (node?: WorktreeNode) => {
        const branch =
          node?.kind === "worktree" ? node.worktree.branch : undefined;
        if (!branch) {
          showWarning("Worktrees: This worktree has no branch checked out.");
          return;
        }
        await vscode.env.clipboard.writeText(branch);
        showInfo(`Worktrees: Copied "${branch}" to clipboard.`);
      }),
    ),
  ];
}
