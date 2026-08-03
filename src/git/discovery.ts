import { readdir } from "node:fs/promises";
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
 * Walk `root` up to `maxDepth` levels deep, returning every directory that
 * contains a `.git` entry (file or directory). A `.git` file means a linked
 * worktree; a `.git` directory means a main repo. Both are valid entry points
 * for `git worktree list`.
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

    if (entries.some((entry) => entry.name === ".git")) {
      found.push(dir);
      return;
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
