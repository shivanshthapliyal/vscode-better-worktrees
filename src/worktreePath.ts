import path from "node:path";

/**
 * Where a new worktree goes. The location is a template rather than a fixed
 * layout because there is no consensus one: some people keep worktrees beside
 * the repo, some collect them all under a single directory. The resolved path
 * is only ever a starting point — the create flow shows it and lets the user
 * edit it before anything is written.
 */

export const DEFAULT_WORKTREE_PATH_TEMPLATE =
  "${repoPath}/../${repoName}-${branch}";

export interface WorktreePathVars {
  repoPath: string;
  branch: string;
  homeDir: string;
}

/**
 * Turns a branch name into a single path segment. Branches are namespaced with
 * slashes far more often than not, and using one verbatim would spread a
 * worktree across nested directories where `feat/api` and `feat/api/v2` cannot
 * both exist. Characters that are awkward or illegal in a path go the same way.
 */
export function sanitizeBranchForPath(branch: string): string {
  const replaced = branch.replace(/[/\\:*?"<>|\s\u0000-\u001f]+/g, "-");
  const collapsed = replaced
    .replace(/-+/g, "-")
    .replace(/_+/g, "_")
    .replace(/\.+/g, ".");
  const trimmed = collapsed.replace(/^[-._]+/, "").replace(/[-._]+$/, "");
  return trimmed || "worktree";
}

/**
 * Expands a path template to an absolute path. Relative templates resolve
 * against the repository rather than the process working directory, which for
 * an extension host is somewhere the user has never heard of.
 */
export function resolveWorktreePath(
  template: string,
  vars: WorktreePathVars,
): string {
  const effective = template.trim() || DEFAULT_WORKTREE_PATH_TEMPLATE;
  const repoPath = path.resolve(vars.repoPath);

  const values: Record<string, string> = {
    repoPath,
    repoName: path.basename(repoPath),
    branch: sanitizeBranchForPath(vars.branch),
  };

  // An unrecognised placeholder is left as written: silently expanding it to
  // nothing would produce a plausible-looking path pointing somewhere else.
  const expanded = effective.replace(
    /\$\{(\w+)\}/g,
    (match, key: string) => values[key] ?? match,
  );

  return path.resolve(repoPath, expandHome(expanded, vars.homeDir));
}

function expandHome(target: string, homeDir: string): string {
  if (target === "~") {
    return homeDir;
  }
  if (target.startsWith("~/") || target.startsWith("~\\")) {
    return path.join(homeDir, target.slice(2));
  }
  return target;
}
