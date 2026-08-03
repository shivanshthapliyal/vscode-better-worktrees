import * as vscode from "vscode";
import { showWarning } from "./notifications";

/**
 * Resolves the folder a command should act on: the URI the command was invoked
 * with, or one the user picks when it was invoked from the palette.
 */
export async function resolveFolderUri(
  uri: vscode.Uri | undefined,
  openLabel: string,
): Promise<vscode.Uri | undefined> {
  const resource = uri ?? (await pickFolderUri(openLabel));
  if (!resource) {
    return undefined;
  }

  if (!(await isFolder(resource))) {
    showWarning("Worktrees: Select a folder for this action.");
    return undefined;
  }

  return resource;
}

async function pickFolderUri(
  openLabel: string,
): Promise<vscode.Uri | undefined> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel,
  });

  return picked?.[0];
}

async function isFolder(uri: vscode.Uri): Promise<boolean> {
  const stat = await vscode.workspace.fs.stat(uri);
  return Boolean(stat.type & vscode.FileType.Directory);
}
