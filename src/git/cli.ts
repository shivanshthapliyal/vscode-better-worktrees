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

/**
 * Relocates a worktree, updating the administrative files that record where it
 * lives. Moving the directory by hand instead leaves those pointing at the old
 * path, which is the breakage `repairWorktrees` exists to undo.
 */
export async function moveWorktree(
  repoPath: string,
  from: string,
  to: string,
): Promise<void> {
  await execFileAsync("git", [
    "-C",
    repoPath,
    "worktree",
    "move",
    "--",
    from,
    to,
  ]);
}

/**
 * Re-points each worktree's `.git` file at the repository. This is the fix for
 * the repository itself having been moved or renamed on disk, which leaves
 * every worktree aimed at a path that no longer exists.
 *
 * It deliberately does not repair a *moved worktree*: git needs the new
 * location passed as an operand for that, and `moveWorktree` avoids the
 * situation in the first place.
 *
 * Returns git's report of what it fixed, which is empty when nothing needed it.
 */
export async function repairWorktrees(repoPath: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync("git", [
    "-C",
    repoPath,
    "worktree",
    "repair",
  ]);
  return `${stdout}${stderr}`.trim();
}

/**
 * Creates a worktree on a new branch. Errors are deliberately not swallowed:
 * git refuses clearly when the branch already exists or the target directory
 * is occupied, and that message is more useful than anything invented here.
 */
export async function createWorktree(
  repoPath: string,
  worktreePath: string,
  branch: string,
  startPoint: string,
): Promise<void> {
  await execFileAsync("git", [
    "-C",
    repoPath,
    "worktree",
    "add",
    "-b",
    branch,
    "--",
    worktreePath,
    startPoint,
  ]);
}

/**
 * Adds a worktree that checks out an existing branch, rather than creating one.
 * No `-b`: the branch must already exist (local, or a remote-tracking ref git
 * can set up a local branch for). Errors are left to git, whose message when
 * the branch is missing or already checked out elsewhere is clearer than any
 * substitute.
 */
export async function addWorktreeForBranch(
  repoPath: string,
  worktreePath: string,
  branch: string,
): Promise<void> {
  await execFileAsync("git", [
    "-C",
    repoPath,
    "worktree",
    "add",
    "--",
    worktreePath,
    branch,
  ]);
}

/** A branch offered for checkout into a new worktree. */
export interface BranchChoice {
  /** The name to hand to `git worktree add` — a local name or `remote/branch`. */
  ref: string;
  /** Whether this is a remote-tracking ref rather than a local branch. */
  isRemote: boolean;
  /** True when the branch is already checked out in some worktree. */
  inWorktree: boolean;
}

/**
 * Local and remote branches that could be checked out into a worktree, with the
 * ones already checked out flagged so the caller can render (and refuse) them.
 * Remote branches whose name already exists locally are dropped, since the local
 * one is the branch the user means.
 */
export async function listBranchesForCheckout(
  repoPath: string,
): Promise<BranchChoice[]> {
  const [locals, remotes, checkedOut] = await Promise.all([
    forEachRefShort(repoPath, "refs/heads"),
    forEachRefShort(repoPath, "refs/remotes"),
    branchesInWorktrees(repoPath),
  ]);

  const localNames = new Set(locals);
  const choices: BranchChoice[] = locals.map((ref) => ({
    ref,
    isRemote: false,
    inWorktree: checkedOut.has(ref),
  }));

  for (const remote of remotes) {
    if (remote.endsWith("/HEAD")) {
      continue;
    }
    // origin/feature → feature; skip when a local branch of that name exists,
    // as checking out the local one is what the user intends.
    const shortName = remote.slice(remote.indexOf("/") + 1);
    if (localNames.has(shortName)) {
      continue;
    }
    choices.push({ ref: remote, isRemote: true, inWorktree: false });
  }

  return choices;
}

async function forEachRefShort(
  repoPath: string,
  ...patterns: string[]
): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("git", [
      "-C",
      repoPath,
      "for-each-ref",
      "--format=%(refname:short)",
      ...patterns,
    ]);
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
  } catch (error) {
    log(`Failed to list refs in ${repoPath}: ${String(error)}`);
    return [];
  }
}

async function branchesInWorktrees(repoPath: string): Promise<Set<string>> {
  const worktrees = await listWorktrees(repoPath);
  const branches = new Set<string>();
  for (const worktree of worktrees) {
    if (worktree.branch) {
      branches.add(worktree.branch);
    }
  }
  return branches;
}

/** Fetches all remotes for the repository behind a worktree, pruning gone refs. */
export async function fetchWorktree(worktreePath: string): Promise<void> {
  await execFileAsync("git", [
    "-C",
    worktreePath,
    "fetch",
    "--all",
    "--prune",
  ]);
}

/**
 * Fast-forward pulls a worktree. `--ff-only` keeps this a safe, non-interactive
 * action from a menu: it either advances cleanly or fails, never opening a merge
 * or leaving the worktree half-merged.
 */
export async function pullWorktree(worktreePath: string): Promise<void> {
  await execFileAsync("git", ["-C", worktreePath, "pull", "--ff-only"]);
}

/**
 * Pushes a worktree's branch. Pass `setUpstreamFor` when the branch has no
 * upstream: a plain `git push` fails in that case, which is the norm for a
 * branch this extension just created, so the first push has to establish it.
 *
 * Never force-pushes. A menu click should not be able to overwrite a remote
 * branch, so a rejected non-fast-forward is left as git's error to report.
 */
export async function pushWorktree(
  worktreePath: string,
  setUpstreamFor: string | undefined,
): Promise<void> {
  const args = ["-C", worktreePath, "push"];
  if (setUpstreamFor) {
    args.push("--set-upstream", "origin", "--", setUpstreamFor);
  }
  await execFileAsync("git", args);
}

/** Whether the branch checked out in a worktree has an upstream configured. */
export async function hasUpstream(worktreePath: string): Promise<boolean> {
  try {
    await execFileAsync("git", [
      "-C",
      worktreePath,
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}",
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Whether the GitHub CLI is on the PATH, for the PR-checkout flow. */
export async function hasGitHubCli(): Promise<boolean> {
  try {
    await execFileAsync("gh", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a worktree checked out to a pull request, via `gh worktree`-style
 * flow: `gh pr checkout` inside a freshly `git worktree add`ed directory on a
 * detached HEAD, then let gh switch it to the PR branch. gh handles the
 * cross-fork and remote-branch cases that raw git cannot.
 */
export async function checkoutPullRequest(
  repoPath: string,
  worktreePath: string,
  prNumber: string,
): Promise<void> {
  // A detached worktree at HEAD gives gh a clean place to check the PR out
  // into; gh then creates and switches to the PR's local branch there.
  await execFileAsync("git", [
    "-C",
    repoPath,
    "worktree",
    "add",
    "--detach",
    "--",
    worktreePath,
  ]);
  try {
    await execFileAsync("gh", ["pr", "checkout", prNumber], {
      cwd: worktreePath,
    });
  } catch (error) {
    // Undo the worktree so a failed checkout does not strand an empty detached
    // directory the user then has to clean up by hand.
    try {
      await removeWorktree(repoPath, worktreePath, true);
    } catch (cleanupError) {
      log(
        `Failed to clean up worktree after PR checkout error: ${String(
          cleanupError,
        )}`,
      );
    }
    throw error;
  }
}

/**
 * Whether git would accept this as a branch name. The rules are fiddly enough
 * (no `..`, no trailing `.lock`, no control characters, and more) that asking
 * git is both shorter and correct where a hand-rolled pattern drifts.
 */
export async function isValidBranchName(
  repoPath: string,
  name: string,
): Promise<boolean> {
  // check-ref-format takes no `--` separator, so a dash-leading name would be
  // read as an option. Such a name is invalid anyway; reject it here.
  if (name.startsWith("-")) {
    return false;
  }
  try {
    await execFileAsync("git", [
      "-C",
      repoPath,
      "check-ref-format",
      "--branch",
      name,
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Local and remote refs offered as the start point for a new branch. */
export async function listStartPoints(repoPath: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("git", [
      "-C",
      repoPath,
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/heads",
      "refs/remotes",
    ]);
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.endsWith("/HEAD"));
  } catch (error) {
    log(`Failed to list refs in ${repoPath}: ${String(error)}`);
    return [];
  }
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
