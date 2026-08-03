import { existsSync } from "node:fs";
import { homedir } from "node:os";
import * as vscode from "vscode";
import { runCommand } from "../commandRunner";
import { openWorktreeIn, worktreePathTemplate } from "../config";
import { shortenHomePath } from "../display";
import { createWorktree, isValidBranchName, listStartPoints } from "../git/cli";
import { showWarning } from "../notifications";
import { RepoGroup } from "../types";
import { WorktreeNode } from "../views/worktreeTree";
import { resolveWorktreePath } from "../worktreePath";
import { CommandContext } from "./context";
import { openFolder } from "./open";

const HEAD_LABEL = "HEAD";

export function registerCreateCommands(
  ctx: CommandContext,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(
      "betterWorktrees.createWorktree",
      runCommand(async (node?: WorktreeNode) => {
        await create(ctx, node);
      }),
    ),
  ];
}

/**
 * Creates a worktree on a new branch, gathering the branch, its start point and
 * the destination in that order. Every step can be cancelled and nothing is
 * written until the last one is accepted.
 */
async function create(
  ctx: CommandContext,
  node: WorktreeNode | undefined,
): Promise<void> {
  const repo = await resolveRepo(ctx, node);
  if (!repo) {
    return;
  }

  const branch = await promptForBranch(repo);
  if (!branch) {
    return;
  }

  const startPoint = await promptForStartPoint(repo);
  if (!startPoint) {
    return;
  }

  const target = await promptForPath(repo, branch);
  if (!target) {
    return;
  }

  await createWorktree(repo.rootPath, target, branch, startPoint);
  await ctx.repos.refresh();

  // Asked rather than opened: creating a worktree to come back to later is as
  // common as creating one to switch to now, and replacing the window on the
  // second guess is disruptive.
  const choice = await vscode.window.showInformationMessage(
    `Worktrees: Created ${branch}.`,
    "Open",
  );
  if (choice === "Open") {
    await openFolder(target, openWorktreeIn() === "newWindow");
  }
}

async function resolveRepo(
  ctx: CommandContext,
  node: WorktreeNode | undefined,
): Promise<RepoGroup | undefined> {
  if (node) {
    return node.repo;
  }

  const repos = ctx.repos.getRepos();
  if (repos.length === 0) {
    showWarning("Worktrees: No git repository found in this workspace.");
    return undefined;
  }
  if (repos.length === 1) {
    return repos[0];
  }

  const picked = await vscode.window.showQuickPick(
    repos.map((repo) => ({
      label: repo.label,
      description: shortenHomePath(repo.rootPath, homedir()),
      repo,
    })),
    { title: "New Worktree", placeHolder: "Select a repository" },
  );
  return picked?.repo;
}

async function promptForBranch(repo: RepoGroup): Promise<string | undefined> {
  const branch = await vscode.window.showInputBox({
    title: "New Worktree",
    prompt: "Name of the branch to create",
    placeHolder: "e.g. feat/new-thing",
    validateInput: async (value) => {
      const trimmed = value.trim();
      if (trimmed === "") {
        return "Enter a branch name.";
      }
      return (await isValidBranchName(repo.rootPath, trimmed))
        ? undefined
        : "Not a valid git branch name.";
    },
  });
  return branch?.trim() || undefined;
}

async function promptForStartPoint(
  repo: RepoGroup,
): Promise<string | undefined> {
  const refs = await listStartPoints(repo.rootPath);
  const items: vscode.QuickPickItem[] = [
    { label: HEAD_LABEL, description: "current checkout of the repository" },
    ...refs.map((ref) => ({ label: ref })),
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: "New Worktree",
    placeHolder: "Start the branch from",
  });
  return picked?.label;
}

async function promptForPath(
  repo: RepoGroup,
  branch: string,
): Promise<string | undefined> {
  const suggestion = resolveWorktreePath(worktreePathTemplate(), {
    repoPath: repo.rootPath,
    branch,
    homeDir: homedir(),
  });

  const target = await vscode.window.showInputBox({
    title: "New Worktree",
    prompt: "Where to create the worktree",
    value: suggestion,
    valueSelection: [suggestion.lastIndexOf("/") + 1, suggestion.length],
    validateInput: (value) => {
      const trimmed = value.trim();
      if (trimmed === "") {
        return "Enter a path.";
      }
      return existsSync(trimmed) ? "That path already exists." : undefined;
    },
  });
  return target?.trim() || undefined;
}
