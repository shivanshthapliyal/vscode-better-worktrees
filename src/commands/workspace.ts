import path from "node:path";
import * as vscode from "vscode";
import { runCommand } from "../commandRunner";
import { showInfo, showWarning } from "../notifications";
import { WorktreeNode, worktreePathFromNode } from "../views/worktreeTree";

/** How long to wait for a newly added workspace folder to register. */
const FOLDER_REGISTRATION_TIMEOUT_MS = 2000;

export function registerWorkspaceCommands(): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(
      "betterWorktrees.worktree.addToWorkspace",
      runCommand(async (node?: WorktreeNode) => {
        await addToWorkspace(node);
      }),
    ),
    vscode.commands.registerCommand(
      "betterWorktrees.worktree.revealInExplorerView",
      runCommand(async (node?: WorktreeNode) => {
        await revealInExplorerView(node);
      }),
    ),
    vscode.commands.registerCommand(
      "betterWorktrees.worktree.removeFromWorkspace",
      runCommand(async (node?: WorktreeNode) => {
        await removeFromWorkspace(node);
      }),
    ),
  ];
}

async function addToWorkspace(node: WorktreeNode | undefined): Promise<boolean> {
  const fsPath = worktreePathFromNode(node);
  if (!fsPath) {
    return false;
  }

  if (findWorkspaceFolderIndex(fsPath) >= 0) {
    showInfo("Worktrees: That worktree is already in the workspace.");
    return true;
  }

  const added = vscode.workspace.updateWorkspaceFolders(
    vscode.workspace.workspaceFolders?.length ?? 0,
    null,
    { uri: vscode.Uri.file(fsPath) },
  );
  if (!added) {
    showWarning("Worktrees: Could not add the worktree to the workspace.");
    return false;
  }

  showInfo(`Worktrees: Added ${path.basename(fsPath)} to the workspace.`);
  return true;
}

/**
 * Reveals a worktree in the Explorer tree. `revealInExplorer` can only select
 * something the Explorer already renders, so a worktree living outside every
 * workspace folder is added as a root first, then revealed once the editor has
 * registered it.
 */
async function revealInExplorerView(
  node: WorktreeNode | undefined,
): Promise<void> {
  const fsPath = worktreePathFromNode(node);
  if (!fsPath) {
    return;
  }

  if (!isInsideWorkspace(fsPath)) {
    if (!(await addToWorkspace(node))) {
      return;
    }
    if (!(await waitForWorkspaceFolder(fsPath))) {
      return;
    }
  }

  await vscode.commands.executeCommand(
    "revealInExplorer",
    vscode.Uri.file(fsPath),
  );
}

async function removeFromWorkspace(
  node: WorktreeNode | undefined,
): Promise<void> {
  const fsPath = worktreePathFromNode(node);
  if (!fsPath) {
    return;
  }

  const target = findWorkspaceFolderIndex(fsPath);
  if (target < 0) {
    showWarning("Worktrees: That worktree is not a workspace folder.");
    return;
  }

  if (!vscode.workspace.updateWorkspaceFolders(target, 1)) {
    showWarning("Worktrees: Could not remove the worktree from the workspace.");
  }
}

function findWorkspaceFolderIndex(fsPath: string): number {
  const target = path.resolve(fsPath);
  return (vscode.workspace.workspaceFolders ?? []).findIndex(
    (folder) => path.resolve(folder.uri.fsPath) === target,
  );
}

function isInsideWorkspace(fsPath: string): boolean {
  const target = path.resolve(fsPath);
  return (vscode.workspace.workspaceFolders ?? []).some((folder) => {
    const folderPath = path.resolve(folder.uri.fsPath);
    return (
      target === folderPath || target.startsWith(`${folderPath}${path.sep}`)
    );
  });
}

/**
 * `updateWorkspaceFolders` returns before the folder is actually registered,
 * and `revealInExplorer` silently does nothing for a path the Explorer does not
 * yet render. Bounded, because adding the first extra root converts the window
 * to a multi-root workspace and restarts the extension host, in which case the
 * event never arrives.
 */
function waitForWorkspaceFolder(fsPath: string): Promise<boolean> {
  if (isInsideWorkspace(fsPath)) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const subscription = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      if (isInsideWorkspace(fsPath)) {
        finish(true);
      }
    });
    const timer = setTimeout(
      () => finish(false),
      FOLDER_REGISTRATION_TIMEOUT_MS,
    );

    function finish(registered: boolean): void {
      clearTimeout(timer);
      subscription.dispose();
      resolve(registered);
    }
  });
}
