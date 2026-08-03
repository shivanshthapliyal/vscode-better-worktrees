import * as vscode from "vscode";
import {
  formatWorktreeLabel,
  paletteIndexForKey,
  worktreeBadge,
  worktreeColorKey,
} from "../display";
import { RepoManager } from "../repoManager";

export const WORKTREE_PALETTE_SIZE = 8;

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
  private readonly subscription: vscode.Disposable;

  readonly onDidChangeFileDecorations = this.changeEmitter.event;

  constructor(private readonly repos: RepoManager) {
    this.subscription = this.repos.onDidChange(() =>
      this.changeEmitter.fire(undefined),
    );
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const worktree = this.repos.getWorktree(uri.fsPath);
    if (!worktree) {
      return undefined;
    }

    const paletteIndex = paletteIndexForKey(
      worktreeColorKey(worktree),
      WORKTREE_PALETTE_SIZE,
    );

    return new vscode.FileDecoration(
      worktreeBadge(worktree),
      `Worktree: ${formatWorktreeLabel(worktree)}`,
      new vscode.ThemeColor(`betterWorktrees.worktreeColor${paletteIndex + 1}`),
    );
  }

  dispose(): void {
    this.subscription.dispose();
    this.changeEmitter.dispose();
  }
}
