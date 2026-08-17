import path from "node:path";
import * as vscode from "vscode";
import { runCommand } from "../commandRunner";
import { listWorktrees } from "../git/cli";
import { showError, showInfo, showWarning } from "../notifications";
import { resolveFolderUri } from "../prompts";
import {
  addWorktreesToSourceControl,
  AddWorktreesDependencies,
  addWorktreeToSourceControl,
  restoreSourceControlScope,
  ScopeSourceControlDependencies,
  scopeSourceControlToWorktree,
} from "../sourceControlScope";
import { WorktreeNode, worktreePathFromNode } from "../views/worktreeTree";
import { CommandContext } from "./context";

/**
 * Paths closed to scope the Source Control view down to one worktree.
 * Persisted per workspace so a reload cannot strand repositories out of view.
 */
const SCOPED_OUT_KEY = "betterWorktrees.scopedOutRepositories";

export function registerSourceControlCommands(
  ctx: CommandContext,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(
      "betterWorktrees.addWorktreesToSourceControl",
      runCommand(async (arg?: vscode.Uri | WorktreeNode) => {
        const cwd = await resolveTargetFolder(arg);
        if (cwd) {
          await addWorktreesToSourceControl(cwd, await addDependencies(ctx));
        }
      }),
    ),
    vscode.commands.registerCommand(
      "betterWorktrees.worktree.revealInSourceControl",
      runCommand(async (node?: WorktreeNode) => {
        await scopeToWorktree(ctx, node);
      }),
    ),
    vscode.commands.registerCommand(
      "betterWorktrees.worktree.addToSourceControl",
      runCommand(async (node?: WorktreeNode) => {
        await addOneToSourceControl(ctx, node);
      }),
    ),
    vscode.commands.registerCommand(
      "betterWorktrees.showAllWorktreesInSourceControl",
      runCommand(async () => {
        await showAll(ctx);
      }),
    ),
  ];
}

async function scopeToWorktree(
  ctx: CommandContext,
  node: WorktreeNode | undefined,
): Promise<void> {
  const fsPath = worktreePathFromNode(node);
  if (!fsPath) {
    return;
  }

  const closed = await scopeSourceControlToWorktree(
    fsPath,
    await scopeDependencies(ctx),
  );
  if (closed === null) {
    return;
  }

  await rememberScopedOut(ctx, closed);
  await vscode.commands.executeCommand("workbench.view.scm");
}

/**
 * Adds one worktree to the Source Control view, leaving whatever is already
 * there alone. Distinct from the scoping command above, which gets a single
 * worktree in view by closing every other repository.
 */
async function addOneToSourceControl(
  ctx: CommandContext,
  node: WorktreeNode | undefined,
): Promise<void> {
  if (node?.kind !== "worktree") {
    return;
  }

  const added = await addWorktreeToSourceControl(
    node.worktree,
    await scopeDependencies(ctx),
  );
  if (!added) {
    return;
  }

  await forgetScopedOut(ctx, node.worktree.path);
  await vscode.commands.executeCommand("workbench.view.scm");
}

/**
 * Reopens everything scoping ever closed. Combines the remembered paths with
 * the worktrees currently known, so a repository closed before a reload — or by
 * the user — still comes back.
 */
async function showAll(ctx: CommandContext): Promise<void> {
  const known = ctx.repos
    .getRepos()
    .flatMap((repo) =>
      repo.worktrees.filter((worktree) => !worktree.isBare).map((w) => w.path),
    );
  const paths = [...readScopedOut(ctx), ...known];
  if (paths.length === 0) {
    return;
  }

  const restored = await restoreSourceControlScope(
    paths,
    await scopeDependencies(ctx),
  );
  await ctx.extension.workspaceState.update(SCOPED_OUT_KEY, []);

  showInfo(
    `Worktrees: Restored ${restored} ${
      restored === 1 ? "repository" : "repositories"
    } in the Source Control view.`,
  );
  await vscode.commands.executeCommand("workbench.view.scm");
}

async function resolveTargetFolder(
  arg: vscode.Uri | WorktreeNode | undefined,
): Promise<string | undefined> {
  if (arg && !(arg instanceof vscode.Uri)) {
    return arg.kind === "repo" ? arg.repo.rootPath : arg.worktree.path;
  }

  const folderUri = await resolveFolderUri(arg, "Add Worktrees to Source Control");
  return folderUri?.fsPath;
}

const notifications = {
  info: showInfo,
  warning: showWarning,
  error: showError,
};

async function scopeDependencies(
  ctx: CommandContext,
): Promise<ScopeSourceControlDependencies> {
  const registry = await ctx.getRegistry();
  return {
    listRegisteredRepositories: async () => registry.list(),
    openRepository: (fsPath: string) => registry.open(fsPath),
    closeRepository: (fsPath: string) => registry.close(fsPath),
    notifications,
  };
}

async function addDependencies(
  ctx: CommandContext,
): Promise<AddWorktreesDependencies> {
  const registry = await ctx.getRegistry();
  return {
    listWorktrees,
    openRepository: (fsPath: string) => registry.open(fsPath),
    notifications,
  };
}

function readScopedOut(ctx: CommandContext): string[] {
  return ctx.extension.workspaceState.get<string[]>(SCOPED_OUT_KEY, []);
}

async function rememberScopedOut(
  ctx: CommandContext,
  paths: readonly string[],
): Promise<void> {
  const merged = new Set([...readScopedOut(ctx), ...paths]);
  await ctx.extension.workspaceState.update(SCOPED_OUT_KEY, [...merged]);
}

/** Drops a path scoping had closed, now that it is open in the view again. */
async function forgetScopedOut(
  ctx: CommandContext,
  fsPath: string,
): Promise<void> {
  const target = path.resolve(fsPath);
  const remaining = readScopedOut(ctx).filter(
    (scoped) => path.resolve(scoped) !== target,
  );
  await ctx.extension.workspaceState.update(SCOPED_OUT_KEY, remaining);
}
