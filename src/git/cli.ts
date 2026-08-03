import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { log } from "../logger";
import { Worktree, WorktreeStatus } from "../types";
import { parseWorktreeList } from "./porcelain";

const execFileAsync = promisify(execFile);

/**
 * Every git invocation in the extension. Commands run through `execFile` with
 * an argument array, never a shell string, so nothing in a path or branch name
 * is interpreted by a shell.
 *
 * Mutating commands additionally place `--` before their path operand: git
 * reads a leading-dash argument as a flag otherwise, and a worktree directory
 * may legitimately be named `-f`. On a subcommand that deletes from disk, that
 * mis-parse would silently apply a flag nobody asked for.
 */

export async function listWorktrees(cwd: string): Promise<Worktree[]> {
  try {
    const { stdout } = await execFileAsync("git", [
      "-C",
      cwd,
      "worktree",
      "list",
      "--porcelain",
    ]);
    return parseWorktreeList(stdout);
  } catch (error) {
    log(`Failed to list worktrees in ${cwd}: ${String(error)}`);
    return [];
  }
}

/**
 * Counts uncommitted changes and upstream divergence for a single worktree.
 * Returns undefined when the worktree directory is gone (a prunable entry) so
 * callers can render it as unknown rather than clean.
 */
export async function getWorktreeStatus(
  worktreePath: string,
): Promise<WorktreeStatus | undefined> {
  try {
    const { stdout } = await execFileAsync("git", [
      "-C",
      worktreePath,
      "status",
      "--porcelain",
    ]);
    const dirtyCount = stdout
      .split("\n")
      .filter((line) => line.trim() !== "").length;

    return { dirtyCount, ...(await getUpstreamDivergence(worktreePath)) };
  } catch (error) {
    log(`Failed to read status for ${worktreePath}: ${String(error)}`);
    return undefined;
  }
}

async function getUpstreamDivergence(
  worktreePath: string,
): Promise<{ ahead: number; behind: number }> {
  try {
    const { stdout } = await execFileAsync("git", [
      "-C",
      worktreePath,
      "rev-list",
      "--left-right",
      "--count",
      "@{upstream}...HEAD",
    ]);
    const [behind, ahead] = stdout.trim().split(/\s+/).map(Number);
    return {
      ahead: Number.isFinite(ahead) ? ahead : 0,
      behind: Number.isFinite(behind) ? behind : 0,
    };
  } catch {
    // No upstream configured, or a detached HEAD. Not an error worth logging.
    return { ahead: 0, behind: 0 };
  }
}

export async function removeWorktree(
  repoPath: string,
  worktreePath: string,
  force: boolean,
): Promise<void> {
  const args = ["-C", repoPath, "worktree", "remove"];
  if (force) {
    args.push("--force");
  }
  args.push("--", worktreePath);
  await execFileAsync("git", args);
}

export async function pruneWorktrees(repoPath: string): Promise<void> {
  await execFileAsync("git", ["-C", repoPath, "worktree", "prune"]);
}

export async function setWorktreeLock(
  repoPath: string,
  worktreePath: string,
  locked: boolean,
  reason?: string,
): Promise<void> {
  const args = ["-C", repoPath, "worktree", locked ? "lock" : "unlock"];
  if (locked && reason) {
    args.push("--reason", reason);
  }
  args.push("--", worktreePath);
  await execFileAsync("git", args);
}

/**
 * The shared git directory behind a worktree. Worktrees of one repository all
 * report the same value, which is what groups them in the tree.
 */
export async function getGitCommonDir(
  cwd: string,
): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", [
      "-C",
      cwd,
      "rev-parse",
      "--git-common-dir",
    ]);
    const dir = stdout.trim();
    if (!dir) {
      return undefined;
    }
    return path.isAbsolute(dir)
      ? path.normalize(dir)
      : path.normalize(path.join(cwd, dir));
  } catch (error) {
    log(`Failed to resolve git common dir in ${cwd}: ${String(error)}`);
    return undefined;
  }
}
