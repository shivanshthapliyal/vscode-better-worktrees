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

/**
 * The semantic roles a branch can map to in `branchType` colour mode. Each maps
 * to one `betterWorktrees.worktreeType*` theme colour. `other` is the fallback
 * for anything the prefix map does not recognise.
 */
export type BranchType =
  | "main"
  | "feature"
  | "fix"
  | "release"
  | "chore"
  | "other";

/**
 * Number of orange shades unrecognised (`other`) branches hash across. A single
 * flat colour would make every untyped branch identical; a family of shades
 * keeps them visibly related ("these are untyped") while staying individually
 * distinguishable.
 */
export const WORKTREE_OTHER_PALETTE_SIZE = 8;

/**
 * Theme-colour id for each recognised {@link BranchType}. `other` is absent
 * here: it resolves to one of the orange shades via {@link branchTypeColorId},
 * chosen by hashing the branch so untyped branches spread across the family.
 */
const BRANCH_TYPE_COLOR_ID: Record<
  Exclude<BranchType, "other">,
  string
> = {
  main: "betterWorktrees.worktreeTypeMain",
  feature: "betterWorktrees.worktreeTypeFeature",
  fix: "betterWorktrees.worktreeTypeFix",
  release: "betterWorktrees.worktreeTypeRelease",
  chore: "betterWorktrees.worktreeTypeChore",
};

/**
 * The prefix → role table used when the user has not overridden it. Keys are the
 * leading branch segment before the first `/` (or a whole-branch name like
 * `main`), matched case-insensitively.
 */
export const DEFAULT_BRANCH_TYPE_MAP: Readonly<Record<string, BranchType>> = {
  main: "main",
  master: "main",
  develop: "main",
  trunk: "main",
  feat: "feature",
  feature: "feature",
  feats: "feature",
  features: "feature",
  fix: "fix",
  fixes: "fix",
  bugfix: "fix",
  hotfix: "fix",
  bug: "fix",
  patch: "fix",
  release: "release",
  releases: "release",
  rel: "release",
  rc: "release",
  chore: "chore",
  chores: "chore",
  refactor: "chore",
  refactoring: "chore",
  docs: "chore",
  doc: "chore",
  test: "chore",
  tests: "chore",
  ci: "chore",
  build: "chore",
  deps: "chore",
  dep: "chore",
  style: "chore",
  perf: "chore",
};

/**
 * Order in which types win when a branch matches more than one. A branch like
 * `feat/urgent-fix` should read as a fix, so `fix` outranks `feature`; `main`
 * is last so a stray `main` token never eclipses a real work type.
 */
const BRANCH_TYPE_PRECEDENCE: readonly BranchType[] = [
  "fix",
  "release",
  "feature",
  "chore",
  "main",
];

/**
 * Classifies a branch by *any* of its parts, not just the leading segment.
 * Real branches are often prefixed by author or workflow — `user/login-fix`,
 * `bot/deploy-preview` — so the type keyword lives mid-name. Every slash-,
 * hyphen-, dot-, and underscore-delimited token is matched against the map
 * (case-insensitively); when several types match, {@link BRANCH_TYPE_PRECEDENCE}
 * decides (a fix beats a feature beats a chore). Nothing matched → `other`.
 * The map is supplied by the caller so the mapping stays configurable.
 */
export function branchTypeForBranch(
  branch: string | undefined,
  map: Readonly<Record<string, BranchType>> = DEFAULT_BRANCH_TYPE_MAP,
): BranchType {
  if (!branch) {
    return "other";
  }

  const tokens = branch.toLowerCase().split(/[/\-_.]+/).filter(Boolean);
  const matched = new Set<BranchType>();
  for (const token of tokens) {
    const type = map[token];
    if (type) {
      matched.add(type);
    }
  }

  if (matched.size === 0) {
    return "other";
  }
  for (const type of BRANCH_TYPE_PRECEDENCE) {
    if (matched.has(type)) {
      return type;
    }
  }
  return "other";
}

/**
 * The theme-colour id for a branch in `branchType` mode. Recognised types map
 * to their single semantic colour; `other` (unrecognised) hashes `key` across
 * the orange shades so untyped branches are a distinguishable family rather
 * than one flat colour.
 */
export function branchTypeColorId(type: BranchType, key: string): string {
  if (type === "other") {
    const shade =
      paletteIndexForKey(key, WORKTREE_OTHER_PALETTE_SIZE) + 1;
    return `betterWorktrees.worktreeTypeOther${shade}`;
  }
  return BRANCH_TYPE_COLOR_ID[type];
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

/**
 * The orders the view can be put in. Every mode keeps the current window's
 * worktree first and bare worktrees last — those two are about finding your
 * place in the list rather than about ordering, so a mode that reshuffled them
 * would cost more than it gained. The mode decides only what happens between.
 */
export type WorktreeSortMode =
  | "branch"
  | "dirtyFirst"
  | "lastCommit"
  | "created";

export const WORKTREE_SORT_MODES: readonly WorktreeSortMode[] = [
  "branch",
  "dirtyFirst",
  "lastCommit",
  "created",
];

/** Times a sort can order by, absent when they could not be read. */
export interface WorktreeTimestamps {
  /** Committer date of the worktree's HEAD, in seconds. */
  lastCommit?: number;
  /** When the worktree was created, in milliseconds. */
  created?: number;
}

export interface SortWorktreesOptions {
  currentPath?: string;
  mode?: WorktreeSortMode;
  /**
   * When set, worktrees whose resolved path is in this set sort ahead of the
   * rest (after the current worktree), surfacing the ones with uncommitted work.
   * Only consulted in `dirtyFirst` mode.
   */
  dirtyPaths?: ReadonlySet<string>;
  /** Keyed by worktree path; only consulted by the timestamp modes. */
  timestamps?: ReadonlyMap<string, WorktreeTimestamps>;
}

export function sortWorktreesForDisplay(
  worktrees: readonly Worktree[],
  options: SortWorktreesOptions | string = {},
): Worktree[] {
  // A bare string keeps the original `(worktrees, currentPath)` call shape
  // working; the object form adds the sort options without a string of
  // positional arguments nobody would remember the order of.
  const { currentPath, mode, dirtyPaths, timestamps } =
    typeof options === "string" ? { currentPath: options } : options;
  const normalizedCurrent = currentPath ? path.resolve(currentPath) : undefined;
  // `dirtyPaths` on its own means dirty-first: the option predates the mode and
  // callers passing it never named a mode.
  const effectiveMode = mode ?? (dirtyPaths ? "dirtyFirst" : "branch");

  return [...worktrees].sort((a, b) => {
    const aCurrent = isCurrentWorktree(a, normalizedCurrent);
    const bCurrent = isCurrentWorktree(b, normalizedCurrent);
    if (aCurrent !== bCurrent) {
      return aCurrent ? -1 : 1;
    }

    if (a.isBare !== b.isBare) {
      return a.isBare ? 1 : -1;
    }

    const byMode = compareByMode(a, b, effectiveMode, dirtyPaths, timestamps);
    if (byMode !== 0) {
      return byMode;
    }

    return worktreeSortKey(a).localeCompare(worktreeSortKey(b));
  });
}

/**
 * The mode-specific part of the order, or 0 to leave the pair to the
 * alphabetical tiebreak. A worktree with no timestamp sorts after every
 * worktree that has one: it is unknown rather than old, and treating a missing
 * time as zero would bury stale and freshly cloned worktrees together at the
 * bottom in an order that changes with the mode.
 */
function compareByMode(
  a: Worktree,
  b: Worktree,
  mode: WorktreeSortMode,
  dirtyPaths: ReadonlySet<string> | undefined,
  timestamps: ReadonlyMap<string, WorktreeTimestamps> | undefined,
): number {
  if (mode === "dirtyFirst") {
    if (!dirtyPaths) {
      return 0;
    }
    const aDirty = dirtyPaths.has(path.resolve(a.path));
    const bDirty = dirtyPaths.has(path.resolve(b.path));
    return aDirty === bDirty ? 0 : aDirty ? -1 : 1;
  }

  if (mode === "lastCommit" || mode === "created") {
    const field = mode === "lastCommit" ? "lastCommit" : "created";
    const aTime = timestamps?.get(path.resolve(a.path))?.[field];
    const bTime = timestamps?.get(path.resolve(b.path))?.[field];
    if (aTime === bTime) {
      return 0;
    }
    if (aTime === undefined) {
      return 1;
    }
    if (bTime === undefined) {
      return -1;
    }
    return bTime - aTime;
  }

  return 0;
}

/** Whether a branch or path substring matches, for the view's filter box. */
export function worktreeMatchesFilter(
  worktree: Worktree,
  filter: string,
): boolean {
  const needle = filter.trim().toLowerCase();
  if (needle === "") {
    return true;
  }
  const haystack = `${worktree.branch ?? ""} ${worktree.path}`.toLowerCase();
  return haystack.includes(needle);
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
