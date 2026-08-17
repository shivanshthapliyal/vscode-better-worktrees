import { homedir } from "node:os";
import path from "node:path";
import * as vscode from "vscode";
import { sortBy } from "../config";
import {
  formatWorktreeLabel,
  formatWorktreeLocation,
  shortenHomePath,
  sortWorktreesForDisplay,
  worktreeMatchesFilter,
} from "../display";
import {
  checkWorktreeRemovable,
  hasStaleWorktrees,
  RemovalContext,
} from "../removal";
import { RepoManager } from "../repoManager";
import { RepoGroup, Worktree, WorktreeStatus } from "../types";

interface RepoTreeNode {
  kind: "repo";
  repo: RepoGroup;
}

interface WorktreeTreeNode {
  kind: "worktree";
  repo: RepoGroup;
  worktree: Worktree;
}

export type WorktreeNode = RepoTreeNode | WorktreeTreeNode;

/** The worktree path a command should act on, or undefined for a repo row. */
export function worktreePathFromNode(
  node: WorktreeNode | undefined,
): string | undefined {
  return node && node.kind === "worktree" ? node.worktree.path : undefined;
}

export class WorktreeTreeProvider
  implements vscode.TreeDataProvider<WorktreeNode>, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<
    WorktreeNode | undefined
  >();
  private readonly subscriptions: vscode.Disposable[] = [];
  private filter = "";

  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(private readonly repos: RepoManager) {
    this.subscriptions.push(
      this.repos.onDidChange(() => this.changeEmitter.fire(undefined)),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration("betterWorktrees.sortBy") ||
          event.affectsConfiguration("betterWorktrees.sortDirtyFirst")
        ) {
          // A timestamp mode has nothing to order by until the times are read,
          // and they are only read while such a mode is selected.
          this.repos.reloadTimestamps();
          this.changeEmitter.fire(undefined);
        }
      }),
    );
  }

  /** Sets the branch/path substring the tree filters rows by; empty clears it. */
  setFilter(filter: string): void {
    const next = filter.trim();
    if (next === this.filter) {
      return;
    }
    this.filter = next;
    void vscode.commands.executeCommand(
      "setContext",
      "betterWorktrees.filterActive",
      next !== "",
    );
    this.changeEmitter.fire(undefined);
  }

  getFilter(): string {
    return this.filter;
  }

  getChildren(node?: WorktreeNode): WorktreeNode[] {
    if (!node) {
      return this.repos.getRepos().map((repo) => ({ kind: "repo", repo }));
    }

    if (node.kind === "repo") {
      const visible = node.repo.worktrees.filter((worktree) =>
        worktreeMatchesFilter(worktree, this.filter),
      );
      return this.sortForRepo(visible, node.repo).map((worktree) => ({
        kind: "worktree",
        repo: node.repo,
        worktree,
      }));
    }

    return [];
  }

  private sortForRepo(
    worktrees: readonly Worktree[],
    repo: RepoGroup,
  ): Worktree[] {
    const mode = sortBy();
    const dirtyPaths =
      mode === "dirtyFirst"
        ? new Set(
            worktrees
              .filter(
                (worktree) =>
                  (this.repos.getStatus(worktree.path)?.dirtyCount ?? 0) > 0,
              )
              .map((worktree) => path.resolve(worktree.path)),
          )
        : undefined;

    return sortWorktreesForDisplay(worktrees, {
      currentPath: repo.rootPath,
      mode,
      dirtyPaths,
      timestamps: this.repos.getTimestamps(),
    });
  }

  getTreeItem(node: WorktreeNode): vscode.TreeItem {
    if (node.kind === "repo") {
      return this.repoItem(node.repo);
    }
    return this.worktreeItem(node);
  }

  private repoItem(repo: RepoGroup): vscode.TreeItem {
    const item = new vscode.TreeItem(
      repo.label,
      vscode.TreeItemCollapsibleState.Expanded,
    );
    item.contextValue = repoContextValue(repo.worktrees);
    item.iconPath = new vscode.ThemeIcon("repo");
    item.resourceUri = vscode.Uri.file(repo.rootPath);
    item.tooltip = repo.rootPath;
    item.description = [
      `${repo.worktrees.length} worktree${
        repo.worktrees.length === 1 ? "" : "s"
      }`,
      shortenHomePath(repo.rootPath, homedir()),
    ].join(GUTTER);
    return item;
  }

  private worktreeItem(node: WorktreeTreeNode): vscode.TreeItem {
    const { worktree } = node;
    const isCurrent = this.repos.isCurrentWindow(worktree.path);
    const status = this.repos.getStatus(worktree.path);

    const item = new vscode.TreeItem(
      formatWorktreeLabel(worktree),
      vscode.TreeItemCollapsibleState.None,
    );
    item.contextValue = buildContextValue(worktree, {
      isMainWorktree: this.repos.isMainWorktree(worktree.path),
      isCurrentWindow: isCurrent,
    });
    item.resourceUri = vscode.Uri.file(worktree.path);
    item.description = formatRowDescription(
      worktree,
      node.repo.rootPath,
      status,
      isCurrent,
    );
    item.tooltip = buildTooltip(worktree, status);
    item.iconPath = buildIcon(worktree, isCurrent);
    item.command = {
      command: "betterWorktrees.worktree.revealInSourceControl",
      title: "Show Only This Worktree in Source Control",
      arguments: [node],
    };
    return item;
  }

  dispose(): void {
    this.subscriptions.forEach((subscription) => subscription.dispose());
    this.changeEmitter.dispose();
  }
}

/**
 * Encodes the states menus filter on. Removability reuses the same check as the
 * remove command, so a row can never offer an action the command would refuse.
 */
export function buildContextValue(
  worktree: Worktree,
  context: RemovalContext,
): string {
  const flags = [
    checkWorktreeRemovable(worktree, context).removable ? "removable" : "",
    worktree.isLocked ? "locked" : "unlocked",
    worktree.isPrunable ? "prunable" : "lockable",
  ].filter(Boolean);

  return ["worktree", ...flags].join(".");
}

/** The repo row's counterpart to {@link buildContextValue}. */
export function repoContextValue(worktrees: readonly Worktree[]): string {
  return hasStaleWorktrees(worktrees) ? "repo.hasStale" : "repo";
}

/**
 * Tree rows expose only a label and a single description string, and VS Code
 * renders the whole description in one muted style — there is no way to fade
 * or colour part of it. Separation therefore has to come from layout: status
 * metadata sits close to the label, then a wide gutter, then the path. The
 * gutter uses em spaces because runs of ASCII spaces collapse when rendered.
 */
const GUTTER = "\u2003\u2003";

function formatRowDescription(
  worktree: Worktree,
  repoRootPath: string,
  status: WorktreeStatus | undefined,
  isCurrent: boolean,
): string {
  const meta = [
    ...(isCurrent ? ["current"] : []),
    ...formatStatusBadges(worktree, status),
  ].join("\u2002");

  const location = formatWorktreeLocation(
    worktree.path,
    repoRootPath,
    homedir(),
  );

  return [meta, location].filter((part) => part !== "").join(GUTTER);
}

function formatStatusBadges(
  worktree: Worktree,
  status: WorktreeStatus | undefined,
): string[] {
  if (worktree.isPrunable) {
    return ["stale"];
  }
  if (worktree.isLocked) {
    return ["locked"];
  }
  if (!status) {
    return [];
  }

  const badges: string[] = [];
  if (status.dirtyCount > 0) {
    badges.push(`${status.dirtyCount}\u25CF`);
  }
  if (status.ahead > 0) {
    badges.push(`\u2191${status.ahead}`);
  }
  if (status.behind > 0) {
    badges.push(`\u2193${status.behind}`);
  }
  return badges.length > 0 ? [badges.join(" ")] : [];
}

function buildIcon(worktree: Worktree, isCurrent: boolean): vscode.ThemeIcon {
  if (worktree.isPrunable) {
    return new vscode.ThemeIcon(
      "warning",
      new vscode.ThemeColor("problemsWarningIcon.foreground"),
    );
  }
  if (worktree.isLocked) {
    return new vscode.ThemeIcon("lock");
  }
  if (isCurrent) {
    return new vscode.ThemeIcon(
      "circle-filled",
      new vscode.ThemeColor("charts.green"),
    );
  }
  if (worktree.isDetached) {
    return new vscode.ThemeIcon("git-commit");
  }
  return new vscode.ThemeIcon("git-branch");
}

function buildTooltip(
  worktree: Worktree,
  status: WorktreeStatus | undefined,
): vscode.MarkdownString {
  const lines = [`**${formatWorktreeLabel(worktree)}**`, "", worktree.path];
  if (worktree.head) {
    lines.push("", `HEAD: \`${worktree.head.slice(0, 12)}\``);
  }
  if (status) {
    lines.push(
      "",
      `${status.dirtyCount} uncommitted change${
        status.dirtyCount === 1 ? "" : "s"
      }`,
      `${status.ahead} ahead, ${status.behind} behind upstream`,
    );
  }
  if (worktree.isLocked) {
    lines.push(
      "",
      `Locked${worktree.lockReason ? `: ${worktree.lockReason}` : ""}`,
    );
  }
  if (worktree.isPrunable) {
    lines.push(
      "",
      `Stale${worktree.prunableReason ? `: ${worktree.prunableReason}` : ""}`,
      "",
      "Use _Prune Worktrees_ to clear it.",
    );
  }
  return new vscode.MarkdownString(lines.join("\n"));
}
