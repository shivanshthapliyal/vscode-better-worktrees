import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { log } from "../logger";

const DEFAULT_IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "out",
  "build",
  ".venv",
  "venv",
  "__pycache__",
  ".cache",
  ".next",
  "target",
]);

/**
 * Whether a `.git` file points at a git directory that still exists.
 *
 * A `.git` file holds `gitdir: <path>` and marks a linked worktree. The path
 * goes stale when the worktree's entry is pruned or the main repository moves,
 * and git itself rejects such a directory. Treating it as a repository anyway
 * makes the whole subtree look like one unusable repo.
 */
async function hasLiveGitdir(gitFile: string): Promise<boolean> {
  let contents;
  try {
    contents = await readFile(gitFile, "utf8");
  } catch {
    return false;
  }

  const match = /^gitdir:\s*(.+)$/m.exec(contents);
  if (!match) {
    return false;
  }

  const target = path.resolve(path.dirname(gitFile), match[1].trim());
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Walk `root` up to `maxDepth` levels deep, returning every directory that
 * contains a usable `.git` entry. A `.git` directory means a main repo; a
 * `.git` file means a linked worktree, and counts only while its `gitdir`
 * still resolves. Both are valid entry points for `git worktree list`.
 *
 * A directory whose `.git` file is stale is not a repository, so the walk
 * continues into it: otherwise one leftover `.git` file at the scan root hides
 * every real repository and worktree beneath it.
 */
export async function findGitRepos(
  root: string,
  maxDepth: number,
): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      log(`Failed to scan ${dir} for git repos: ${String(error)}`);
      return;
    }

    const gitEntry = entries.find((entry) => entry.name === ".git");
    if (gitEntry) {
      if (gitEntry.isDirectory() || (await hasLiveGitdir(path.join(dir, ".git")))) {
        found.push(dir);
        return;
      }
      log(`Ignoring ${dir}: .git does not point at an existing git directory.`);
    }

    if (depth >= maxDepth) {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || DEFAULT_IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      await walk(path.join(dir, entry.name), depth + 1);
    }
  }

  await walk(root, 0);
  return found;
}
