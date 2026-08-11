import * as vscode from "vscode";
import { branchTypeMap, colorMode } from "../config";
import {
  branchTypeColorId,
  branchTypeForBranch,
  formatWorktreeLabel,
  paletteIndexForKey,
  worktreeBadge,
  worktreeColorKey,
} from "../display";
import { RepoManager } from "../repoManager";
import { Worktree } from "../types";

export const WORKTREE_PALETTE_SIZE = 20;

/**
 * Badges and colours worktree folders wherever the editor renders a path —
 * the Explorer, tabs, the Open Editors list — so a file's worktree is
 * identifiable without reading the full path.
 */
export class WorktreeDecorationProvider
  implements vscode.FileDecorationProvider, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<
    undefined | vscode.Uri | vscode.Uri[]
  >();
  private readonly subscriptions: vscode.Disposable[] = [];

  readonly onDidChangeFileDecorations = this.changeEmitter.event;

  constructor(private readonly repos: RepoManager) {
    this.subscriptions.push(
      this.repos.onDidChange(() => this.changeEmitter.fire(undefined)),
      // Colour mode and the branch-type map change decorations without any
      // worktree changing, so repaint when either setting moves.
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration("betterWorktrees.colorMode") ||
          event.affectsConfiguration("betterWorktrees.branchTypeMap")
        ) {
          this.changeEmitter.fire(undefined);
        }
      }),
    );
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const worktree = this.repos.getWorktree(uri.fsPath);
    if (!worktree) {
      return undefined;
    }

    return new vscode.FileDecoration(
      worktreeBadge(worktree),
      `Worktree: ${formatWorktreeLabel(worktree)}`,
      new vscode.ThemeColor(colorIdForWorktree(worktree)),
    );
  }

  dispose(): void {
    this.subscriptions.forEach((subscription) => subscription.dispose());
    this.changeEmitter.dispose();
  }
}

/**
 * The theme-colour id for a worktree under the active colour mode. `branch`
 * (the default) hashes the branch name across the 8-colour palette so every
 * branch is a distinct colour; `branchType` maps the branch's leading segment
 * to a semantic colour so branches of the same kind share one.
 */
function colorIdForWorktree(worktree: Worktree): string {
  if (colorMode() === "branchType") {
    const type = branchTypeForBranch(worktree.branch, branchTypeMap());
    return branchTypeColorId(type, worktreeColorKey(worktree));
  }

  const paletteIndex = paletteIndexForKey(
    worktreeColorKey(worktree),
    WORKTREE_PALETTE_SIZE,
  );
  return `betterWorktrees.worktreeColor${paletteIndex + 1}`;
}
