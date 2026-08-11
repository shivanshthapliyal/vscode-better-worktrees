import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { registerViewCommands } from "./commands/view";
import {
  createGitRepositoryRegistry,
  GitRepositoryRegistry,
} from "./git/registry";
import { disposeOutputChannel, log } from "./logger";
import { RepoManager } from "./repoManager";
import { WorktreeDecorationProvider } from "./views/decorations";
import { WorktreeTreeProvider } from "./views/worktreeTree";

export const VIEW_ID = "betterWorktrees.worktrees";

export function activate(context: vscode.ExtensionContext): void {
  const repos = new RepoManager();
  const treeProvider = new WorktreeTreeProvider(repos);
  const decorationProvider = new WorktreeDecorationProvider(repos);

  context.subscriptions.push(
    repos,
    treeProvider,
    decorationProvider,
    vscode.window.createTreeView(VIEW_ID, {
      treeDataProvider: treeProvider,
      showCollapseAll: true,
    }),
    vscode.window.registerFileDecorationProvider(decorationProvider),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void repos.refresh();
    }),
    ...registerCommands({
      extension: context,
      repos,
      getRegistry: createRegistryProvider(),
    }),
    ...registerViewCommands(treeProvider),
  );

  void repos.refresh();
  log("Better Worktrees is ready.");
}

export function deactivate(): void {
  disposeOutputChannel();
}

/**
 * Resolves the Git repository registry once and reuses it. Scoped to this
 * activation rather than held in module state, so a disable/enable cycle within
 * one extension host cannot hand back a registry from a dead session.
 */
function createRegistryProvider(): () => Promise<GitRepositoryRegistry> {
  let pending: Promise<GitRepositoryRegistry> | undefined;
  return () => (pending ??= createGitRepositoryRegistry());
}
