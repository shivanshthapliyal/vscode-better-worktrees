import path from "node:path";
import { Worktree } from "./types";

/**
 * How a worktree is presented: its label, badge, colour key, path and sort
 * order. Pure functions over {@link Worktree}, shared by the tree, the
 * decorations and the quick pick so all three describe a worktree identically.
 */

export function formatWorktreeLabel(worktree: Worktree): string {
  if (worktree.isBare) {
    return "(bare)";
  }
  if (worktree.branch) {
    return worktree.branch;
  }
  if (worktree.isDetached) {
    const shortHead = worktree.head ? worktree.head.slice(0, 7) : "unknown";
    return `detached @ ${shortHead}`;
  }
  return path.basename(worktree.path);
}

export function worktreeColorKey(worktree: Worktree): string {
  return worktree.branch ?? worktree.path;
}

export function worktreeBadge(worktree: Worktree): string {
  if (worktree.isBare) {
    return "BA";
  }
  if (worktree.isDetached && !worktree.branch) {
    return "DT";
  }

  const branch = worktree.branch ?? path.basename(worktree.path);
  const segment = branch.split("/").pop() ?? branch;
  const alnum = segment.replace(/[^a-zA-Z0-9]/g, "");
  return (alnum || segment).slice(0, 2).toUpperCase();
}

export function paletteIndexForKey(key: string, paletteSize: number): number {
  let hash = 5381;
  for (let i = 0; i < key.length; i += 1) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) >>> 0;
  }
  return hash % paletteSize;
}

export function shortenHomePath(fsPath: string, homeDir: string): string {
  const normalizedHome = homeDir.replace(/[/\\]+$/, "");
  if (fsPath === normalizedHome) {
    return "~";
  }
  if (fsPath.startsWith(`${normalizedHome}/`)) {
    return `~/${fsPath.slice(normalizedHome.length + 1)}`;
  }
  return fsPath;
}

/**
 * The path shown next to a worktree label. Worktrees of a repo nearly always
 * share a long common prefix, so showing it on every row is noise: the repo
 * row already carries the absolute root. Renders the main worktree with no
 * path at all, worktrees inside the repo relative to it, and anything living
 * elsewhere as a home-shortened absolute path.
 */
export function formatWorktreeLocation(
  worktreePath: string,
  repoRootPath: string,
  homeDir: string,
): string {
  const resolved = path.resolve(worktreePath);
  const root = path.resolve(repoRootPath);

  if (resolved === root) {
    return "";
  }

  const relative = path.relative(root, resolved);
  if (
    relative !== "" &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  ) {
    return relative;
  }

  return shortenHomePath(worktreePath, homeDir);
}

export function sortWorktreesForDisplay(
  worktrees: readonly Worktree[],
  currentPath?: string,
): Worktree[] {
  const normalizedCurrent = currentPath ? path.resolve(currentPath) : undefined;

  return [...worktrees].sort((a, b) => {
    const aCurrent = isCurrentWorktree(a, normalizedCurrent);
    const bCurrent = isCurrentWorktree(b, normalizedCurrent);
    if (aCurrent !== bCurrent) {
      return aCurrent ? -1 : 1;
    }

    if (a.isBare !== b.isBare) {
      return a.isBare ? 1 : -1;
    }

    return worktreeSortKey(a).localeCompare(worktreeSortKey(b));
  });
}

function isCurrentWorktree(
  worktree: Worktree,
  normalizedCurrent?: string,
): boolean {
  return normalizedCurrent !== undefined
    ? path.resolve(worktree.path) === normalizedCurrent
    : false;
}

function worktreeSortKey(worktree: Worktree): string {
  return (worktree.branch ?? path.basename(worktree.path)).toLowerCase();
}
