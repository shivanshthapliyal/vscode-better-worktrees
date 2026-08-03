import { homedir } from "node:os";
import * as vscode from "vscode";
import { runCommand } from "../commandRunner";
import { openWorktreeIn, OpenTarget } from "../config";
import {
  formatWorktreeLabel,
  shortenHomePath,
  sortWorktreesForDisplay,
} from "../display";
import { listWorktrees } from "../git/cli";
import { showWarning } from "../notifications";
import { Worktree } from "../types";
import { WorktreeNode, worktreePathFromNode } from "../views/worktreeTree";
import { CommandContext } from "./context";

interface WorktreeQuickPickItem extends vscode.QuickPickItem {
  worktree: Worktree;
}

export function registerOpenCommands(ctx: CommandContext): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(
      "betterWorktrees.openWorktree",
      runCommand(async (uri?: vscode.Uri) => {
        await openWorktreeQuickPick(ctx, uri);
      }),
    ),
    vscode.commands.registerCommand(
      "betterWorktrees.worktree.openInNewWindow",
      runCommand(async (node?: WorktreeNode) => {
        await openNode(node, true);
      }),
    ),
    vscode.commands.registerCommand(
      "betterWorktrees.worktree.openInCurrentWindow",
      runCommand(async (node?: WorktreeNode) => {
        await openNode(node, false);
      }),
    ),
    vscode.commands.registerCommand(
      "betterWorktrees.worktree.reveal",
      runCommand(async (node?: WorktreeNode) => {
        const fsPath = worktreePathFromNode(node);
        if (fsPath) {
          await vscode.commands.executeCommand(
            "revealFileInOS",
            vscode.Uri.file(fsPath),
          );
        }
      }),
    ),
    vscode.commands.registerCommand(
      "betterWorktrees.worktree.openTerminal",
      runCommand(async (node?: WorktreeNode) => {
        const fsPath = worktreePathFromNode(node);
        if (!fsPath) {
          return;
        }
        const terminal = vscode.window.createTerminal({
          name:
            node?.kind === "worktree"
              ? formatWorktreeLabel(node.worktree)
              : "Worktree",
          cwd: fsPath,
        });
        terminal.show();
      }),
    ),
  ];
}

function forcesNewWindow(target: OpenTarget): boolean {
  return target === "newWindow";
}

/**
 * Lists worktrees for the palette. Each row carries a button for the opposite
 * of the configured target, so either destination is one action away without
 * a trip to settings.
 */
async function openWorktreeQuickPick(
  ctx: CommandContext,
  uri: vscode.Uri | undefined,
): Promise<void> {
  const worktrees = uri
    ? await listWorktrees(uri.fsPath)
    : ctx.repos.getRepos().flatMap((repo) => repo.worktrees);

  if (worktrees.length === 0) {
    showWarning("Worktrees: No git worktrees found.");
    return;
  }

  const items: WorktreeQuickPickItem[] = sortWorktreesForDisplay(worktrees).map(
    (worktree) => ({
      label: formatWorktreeLabel(worktree),
      description: shortenHomePath(worktree.path, homedir()),
      worktree,
    }),
  );

  const defaultTarget = openWorktreeIn();
  const altTarget: OpenTarget =
    defaultTarget === "newWindow" ? "currentWindow" : "newWindow";

  const altButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon(
      altTarget === "newWindow" ? "empty-window" : "window",
    ),
    tooltip:
      altTarget === "newWindow"
        ? "Open in New Window"
        : "Open in Current Window",
  };

  const quickPick = vscode.window.createQuickPick<WorktreeQuickPickItem>();
  quickPick.items = items.map((item) => ({ ...item, buttons: [altButton] }));
  quickPick.placeholder =
    defaultTarget === "newWindow"
      ? "Select a worktree to open in a new window"
      : "Select a worktree to open in the current window";
  quickPick.matchOnDescription = true;

  quickPick.onDidTriggerItemButton(async (event) => {
    quickPick.hide();
    await openFolder(event.item.worktree.path, forcesNewWindow(altTarget));
  });
  quickPick.onDidAccept(async () => {
    const selected = quickPick.selectedItems[0];
    quickPick.hide();
    if (selected) {
      await openFolder(selected.worktree.path, forcesNewWindow(defaultTarget));
    }
  });
  quickPick.onDidHide(() => quickPick.dispose());
  quickPick.show();
}

async function openNode(
  node: WorktreeNode | undefined,
  forceNewWindow: boolean,
): Promise<void> {
  const fsPath = worktreePathFromNode(node);
  if (fsPath) {
    await openFolder(fsPath, forceNewWindow);
  }
}

export async function openFolder(
  fsPath: string,
  forceNewWindow: boolean,
): Promise<void> {
  await vscode.commands.executeCommand(
    "vscode.openFolder",
    vscode.Uri.file(fsPath),
    { forceNewWindow },
  );
}
