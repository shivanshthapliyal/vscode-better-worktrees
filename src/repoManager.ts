import path from "node:path";
import * as vscode from "vscode";
import { scanDepth } from "./config";
import {
  getGitCommonDir,
  getWorktreeStatus,
  listWorktrees,
} from "./git/cli";
import { findGitRepos } from "./git/discovery";
import { RepoGroup, Worktree, WorktreeStatus } from "./types";

const REFRESH_DEBOUNCE_MS = 300;

function statusesEqual(
  a: Map<string, WorktreeStatus>,
  b: Map<string, WorktreeStatus>,
): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, value] of a) {
    const other = b.get(key);
    if (
      other === undefined ||
      other.dirtyCount !== value.dirtyCount ||
      other.ahead !== value.ahead ||
      other.behind !== value.behind
    ) {
      return false;
    }
  }
  return true;
}

/**
 * The single source of truth for what worktrees exist. Scans the workspace for
 * repositories, groups their worktrees by shared git directory, watches for
 * changes, and answers the questions the views and commands ask about a
 * worktree. Fires `onDidChange` whenever any of that moves.
 */
export class RepoManager {
  private repos: RepoGroup[] = [];
  private worktreesByPath = new Map<string, Worktree>();
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private watchers: vscode.FileSystemWatcher[] = [];
  private watchedCommonDirs = new Set<string>();
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private statuses = new Map<string, WorktreeStatus>();
  private statusToken = 0;
  private disposed = false;

  readonly onDidChange = this.changeEmitter.event;

  getRepos(): readonly RepoGroup[] {
    return this.repos;
  }

  getWorktree(fsPath: string): Worktree | undefined {
    return this.worktreesByPath.get(path.resolve(fsPath));
  }

  getStatus(fsPath: string): WorktreeStatus | undefined {
    return this.statuses.get(path.resolve(fsPath));
  }

  /** The repository group a worktree belongs to, for git commands that need a cwd. */
  getRepoFor(worktreePath: string): RepoGroup | undefined {
    const target = path.resolve(worktreePath);
    return this.repos.find((repo) =>
      repo.worktrees.some((w) => path.resolve(w.path) === target),
    );
  }

  isMainWorktree(worktreePath: string): boolean {
    const repo = this.getRepoFor(worktreePath);
    return repo
      ? path.resolve(repo.rootPath) === path.resolve(worktreePath)
      : false;
  }

  /** True when a folder open in this window lives inside the given worktree. */
  isCurrentWindow(worktreePath: string): boolean {
    const target = path.resolve(worktreePath);
    return (vscode.workspace.workspaceFolders ?? []).some((folder) => {
      const folderPath = path.resolve(folder.uri.fsPath);
      return (
        folderPath === target || folderPath.startsWith(`${target}${path.sep}`)
      );
    });
  }

  async refresh(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const depth = scanDepth();
    const groups = new Map<string, RepoGroup>();
    const scannedRoots = new Set<string>();

    for (const folder of folders) {
      const repoRoots = await findGitRepos(folder.uri.fsPath, depth);
      for (const repoRoot of repoRoots) {
        if (scannedRoots.has(repoRoot)) {
          continue;
        }
        scannedRoots.add(repoRoot);

        const commonDir = await getGitCommonDir(repoRoot);
        if (!commonDir || groups.has(commonDir)) {
          continue;
        }

        const worktrees = await listWorktrees(repoRoot);
        if (worktrees.length === 0) {
          continue;
        }

        const mainWorktree = worktrees[0];
        groups.set(commonDir, {
          commonDir,
          rootPath: mainWorktree.path,
          label: path.basename(mainWorktree.path) || mainWorktree.path,
          worktrees,
        });
      }
    }

    if (this.disposed) {
      return;
    }

    this.repos = [...groups.values()].sort((a, b) =>
      a.label.localeCompare(b.label),
    );

    this.worktreesByPath = new Map();
    for (const repo of this.repos) {
      for (const worktree of repo.worktrees) {
        this.worktreesByPath.set(path.resolve(worktree.path), worktree);
      }
    }

    this.syncWatchers();
    this.changeEmitter.fire();
    void this.loadStatuses();
  }

  /**
   * Status is loaded after the tree has already rendered: one `git status` per
   * worktree is too slow to block the view on, and the tree is useful without
   * it. A token guards against a slow load overwriting a newer refresh.
   */
  private async loadStatuses(): Promise<void> {
    const token = ++this.statusToken;
    const worktrees = this.repos.flatMap((repo) =>
      repo.worktrees.filter((w) => !w.isBare && !w.isPrunable),
    );

    const results = await Promise.all(
      worktrees.map(async (worktree) => ({
        path: path.resolve(worktree.path),
        status: await getWorktreeStatus(worktree.path),
      })),
    );

    if (token !== this.statusToken || this.disposed) {
      return;
    }

    const next = new Map(
      results
        .filter((entry) => entry.status !== undefined)
        .map((entry) => [entry.path, entry.status as WorktreeStatus]),
    );

    // Only notify when a status actually moved. A refresh triggered by a
    // watcher event often finds every worktree unchanged; firing anyway forces
    // the decoration provider to re-query and repaint colours that never
    // change on a status load, which reads as flicker.
    if (statusesEqual(this.statuses, next)) {
      return;
    }

    this.statuses = next;
    this.changeEmitter.fire();
  }

  /**
   * Watches each repository's `$GIT_COMMON_DIR/worktrees` directory, which git
   * writes to on `worktree add` and clears on `worktree remove`. Without this
   * the view only updates on manual refresh or a workspace folder change.
   *
   * The pattern is `worktrees/*` — a single segment — so it matches only the
   * per-worktree entry directories that `worktree add`/`remove` create and
   * delete. It deliberately does NOT match `worktrees/**`: git rewrites the
   * `index`, `logs/`, and `index.lock` files one level deeper on ordinary
   * reads, including the `git status` this extension itself runs each refresh.
   * Watching those inner files created a feedback loop — status churn fired the
   * watcher, which refreshed, which ran status again — that repainted the
   * decoration colours without end.
   */
  private syncWatchers(): void {
    const commonDirs = new Set(this.repos.map((repo) => repo.commonDir));
    const unchanged =
      commonDirs.size === this.watchedCommonDirs.size &&
      [...commonDirs].every((dir) => this.watchedCommonDirs.has(dir));
    if (unchanged) {
      return;
    }

    this.disposeWatchers();
    this.watchedCommonDirs = commonDirs;

    for (const commonDir of commonDirs) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.file(commonDir), "worktrees/*"),
        false,
        true,
        false,
      );
      watcher.onDidCreate(() => this.scheduleRefresh());
      watcher.onDidDelete(() => this.scheduleRefresh());
      this.watchers.push(watcher);
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.refresh();
    }, REFRESH_DEBOUNCE_MS);
  }

  private disposeWatchers(): void {
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers = [];
  }

  dispose(): void {
    this.disposed = true;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.disposeWatchers();
    this.changeEmitter.dispose();
  }
}
