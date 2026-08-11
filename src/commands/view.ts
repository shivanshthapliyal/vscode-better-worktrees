import * as vscode from "vscode";
import { runCommand } from "../commandRunner";
import { WorktreeTreeProvider } from "../views/worktreeTree";

const SORT_DIRTY_FIRST = "betterWorktrees.sortDirtyFirst";

/**
 * Commands that act on the view itself rather than on git: the filter box and
 * the dirty-first sort toggle. They take the tree provider directly because
 * both change what the tree shows, which the shared command context does not
 * carry.
 */
export function registerViewCommands(
  tree: WorktreeTreeProvider,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(
      "betterWorktrees.filterWorktrees",
      runCommand(async () => {
        const filter = await vscode.window.showInputBox({
          title: "Filter Worktrees",
          prompt: "Show only worktrees whose branch or path contains",
          placeHolder: "e.g. feat, fix, or a path fragment",
          value: tree.getFilter(),
        });
        // Undefined means the box was dismissed — leave the filter untouched.
        // An empty string is a deliberate clear.
        if (filter !== undefined) {
          tree.setFilter(filter);
        }
      }),
    ),
    vscode.commands.registerCommand(
      "betterWorktrees.clearWorktreeFilter",
      runCommand(async () => {
        tree.setFilter("");
      }),
    ),
    vscode.commands.registerCommand(
      "betterWorktrees.toggleSortDirtyFirst",
      runCommand(async () => {
        const config = vscode.workspace.getConfiguration();
        const current = config.get<boolean>(SORT_DIRTY_FIRST, false);
        await config.update(
          SORT_DIRTY_FIRST,
          !current,
          vscode.ConfigurationTarget.Global,
        );
      }),
    ),
  ];
}
