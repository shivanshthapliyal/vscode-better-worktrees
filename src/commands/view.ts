import * as vscode from "vscode";
import { runCommand } from "../commandRunner";
import { sortBy } from "../config";
import { WorktreeSortMode } from "../display";
import { WorktreeTreeProvider } from "../views/worktreeTree";

const SORT_BY = "betterWorktrees.sortBy";
const SORT_DIRTY_FIRST = "betterWorktrees.sortDirtyFirst";

/** The sort modes as the picker presents them, in the order they are offered. */
const SORT_CHOICES: readonly {
  mode: WorktreeSortMode;
  label: string;
  description: string;
}[] = [
  {
    mode: "branch",
    label: "Branch name",
    description: "Alphabetical by branch",
  },
  {
    mode: "dirtyFirst",
    label: "Uncommitted changes first",
    description: "Worktrees with changes lead",
  },
  {
    mode: "lastCommit",
    label: "Last commit",
    description: "Most recently committed first",
  },
  {
    mode: "created",
    label: "Recently created",
    description: "Newest worktree first",
  },
];

/**
 * Commands that act on the view itself rather than on git: the filter box and
 * the sort-mode picker. They take the tree provider directly because both
 * change what the tree shows, which the shared command context does not carry.
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
      "betterWorktrees.sortWorktrees",
      runCommand(async () => {
        const current = sortBy();
        const picked = await vscode.window.showQuickPick(
          SORT_CHOICES.map((choice) => ({
            label: choice.label,
            description: choice.description,
            picked: choice.mode === current,
            mode: choice.mode,
          })),
          {
            title: "Sort Worktrees By",
            placeHolder: `Currently sorting by ${
              SORT_CHOICES.find((choice) => choice.mode === current)?.label ??
              current
            }`,
          },
        );
        if (picked) {
          await applySortMode(picked.mode);
        }
      }),
    ),
  ];
}

/**
 * Writes the chosen mode, and clears the superseded boolean alongside it. Left
 * set, `sortDirtyFirst` would keep showing as enabled in the settings UI while
 * having no effect, which reads as the setting being broken.
 */
async function applySortMode(mode: WorktreeSortMode): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  await config.update(SORT_BY, mode, vscode.ConfigurationTarget.Global);
  if (config.get<boolean>(SORT_DIRTY_FIRST) !== undefined) {
    await config.update(
      SORT_DIRTY_FIRST,
      undefined,
      vscode.ConfigurationTarget.Global,
    );
  }
}
