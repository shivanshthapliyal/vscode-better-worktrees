import { existsSync } from "node:fs";
import { homedir } from "node:os";
import * as vscode from "vscode";
import { runCommand } from "../commandRunner";
import { openWorktreeIn, worktreePathTemplate } from "../config";
import { shortenHomePath } from "../display";
import {
  addWorktreeForBranch,
  BranchChoice,
  checkoutPullRequest,
  createWorktree,
  hasGitHubCli,
  isValidBranchName,
  listBranchesForCheckout,
  listStartPoints,
} from "../git/cli";
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
    vscode.commands.registerCommand(
      "betterWorktrees.checkoutWorktree",
      runCommand(async (node?: WorktreeNode) => {
        await checkout(ctx, node);
      }),
    ),
    vscode.commands.registerCommand(
      "betterWorktrees.worktreeFromPullRequest",
      runCommand(async (node?: WorktreeNode) => {
        await fromPullRequest(ctx, node);
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
  await afterCreate(ctx, target, `Created ${branch}.`);
}

/**
 * Checks out an existing branch — local or remote-tracking — into a new
 * worktree. This is the sibling of {@link create}: same repo → path flow, but
 * the branch is picked from what already exists rather than named anew.
 */
async function checkout(
  ctx: CommandContext,
  node: WorktreeNode | undefined,
): Promise<void> {
  const repo = await resolveRepo(ctx, node);
  if (!repo) {
    return;
  }

  const branches = await listBranchesForCheckout(repo.rootPath);
  const available = branches.filter((choice) => !choice.inWorktree);
  if (available.length === 0) {
    showWarning(
      "Worktrees: No branches left to check out — every branch is already in a worktree.",
    );
    return;
  }

  const branch = await promptForExistingBranch(available);
  if (!branch) {
    return;
  }

  const target = await promptForPath(repo, branch);
  if (!target) {
    return;
  }

  await addWorktreeForBranch(repo.rootPath, target, branch);
  await afterCreate(ctx, target, `Checked out ${branch}.`);
}

/**
 * Creates a worktree checked out to a GitHub pull request via `gh pr checkout`.
 * Degrades to a clear warning when the GitHub CLI is not installed rather than
 * failing with an opaque spawn error.
 */
async function fromPullRequest(
  ctx: CommandContext,
  node: WorktreeNode | undefined,
): Promise<void> {
  if (!(await hasGitHubCli())) {
    showWarning(
      "Worktrees: The GitHub CLI (gh) is not installed. Install it from https://cli.github.com to create a worktree from a pull request.",
    );
    return;
  }

  const repo = await resolveRepo(ctx, node);
  if (!repo) {
    return;
  }

  const pr = await promptForPullRequest();
  if (!pr) {
    return;
  }

  const target = await promptForPath(repo, `pr-${pr}`);
  if (!target) {
    return;
  }

  await checkoutPullRequest(repo.rootPath, target, pr);
  await afterCreate(ctx, target, `Checked out PR #${pr}.`);
}

/**
 * The shared tail of every creation flow: refresh the view, then offer to open
 * the worktree. Asked rather than opened — creating a worktree to return to
 * later is as common as switching to it now, and replacing the window on a
 * guess is disruptive.
 */
async function afterCreate(
  ctx: CommandContext,
  target: string,
  message: string,
): Promise<void> {
  await ctx.repos.refresh();
  const choice = await vscode.window.showInformationMessage(
    `Worktrees: ${message}`,
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

interface BranchQuickPickItem extends vscode.QuickPickItem {
  ref: string;
}

async function promptForExistingBranch(
  choices: BranchChoice[],
): Promise<string | undefined> {
  const items: BranchQuickPickItem[] = choices.map((choice) => ({
    label: choice.ref,
    description: choice.isRemote ? "remote" : "local",
    iconPath: new vscode.ThemeIcon(
      choice.isRemote ? "cloud" : "git-branch",
    ),
    ref: choice.ref,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: "Checkout Worktree",
    placeHolder: "Select a branch to check out into a new worktree",
    matchOnDescription: true,
  });
  return picked?.ref;
}

async function promptForPullRequest(): Promise<string | undefined> {
  const pr = await vscode.window.showInputBox({
    title: "Worktree from Pull Request",
    prompt: "Pull request number or URL",
    placeHolder: "e.g. 42",
    validateInput: (value) => {
      const trimmed = value.trim();
      if (trimmed === "") {
        return "Enter a pull request number or URL.";
      }
      // gh accepts a number, a URL, or a branch; a leading dash would be read
      // as a flag, so reject it. Everything else is left for gh to judge.
      return trimmed.startsWith("-") ? "Not a valid pull request." : undefined;
    },
  });
  return pr?.trim() || undefined;
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
