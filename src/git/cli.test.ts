import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[][] = [];
const mock = { stdout: "", fail: false };

vi.mock("node:child_process", () => ({
  execFile: (
    _command: string,
    args: string[],
    callback: (error: unknown, result: unknown) => void,
  ) => {
    calls.push(args);
    if (mock.fail) {
      callback(new Error("git failed"), null);
      return;
    }
    callback(null, { stdout: mock.stdout, stderr: "" });
  },
}));
vi.mock("vscode", () => ({}), { virtual: true });
vi.mock("../logger", () => ({ log: vi.fn() }));

/** Paths to a `.git` entry's mtime, and whether it is a file or a directory. */
const statMock = {
  entries: new Map<string, { mtimeMs: number; isFile: boolean }>(),
};

vi.mock("node:fs/promises", () => ({
  stat: (target: string) => {
    const entry = statMock.entries.get(target);
    if (!entry) {
      return Promise.reject(new Error("ENOENT"));
    }
    return Promise.resolve({
      mtimeMs: entry.mtimeMs,
      isFile: () => entry.isFile,
    });
  },
}));

import {
  createWorktree,
  getWorktreeTimestamps,
  hasUpstream,
  isValidBranchName,
  listStartPoints,
  moveWorktree,
  pruneWorktrees,
  pushWorktree,
  removeWorktree,
  repairWorktrees,
  setWorktreeLock,
} from "./cli";

function lastArgs(): string[] {
  return calls[calls.length - 1];
}

/**
 * Git parses a leading-dash operand as a flag unless `--` precedes it. These
 * assertions pin the argv shape because the consequence on a destructive
 * subcommand is silently operating with an unintended flag.
 */
describe("git worktree argv construction", () => {
  beforeEach(() => {
    calls.length = 0;
    mock.stdout = "";
    mock.fail = false;
  });

  it("separates the path operand from options on remove", async () => {
    await removeWorktree("/repo", "/repo/wt", false);
    expect(lastArgs()).toEqual([
      "-C",
      "/repo",
      "worktree",
      "remove",
      "--",
      "/repo/wt",
    ]);
  });

  it("keeps --force before the separator on remove", async () => {
    await removeWorktree("/repo", "/repo/wt", true);
    expect(lastArgs()).toEqual([
      "-C",
      "/repo",
      "worktree",
      "remove",
      "--force",
      "--",
      "/repo/wt",
    ]);
  });

  it("does not let a dash-leading path become a flag", async () => {
    await removeWorktree("/repo", "-f", false);
    const args = lastArgs();
    expect(args).toContain("--");
    expect(args.indexOf("-f")).toBeGreaterThan(args.indexOf("--"));
  });

  it("separates the path operand on lock, keeping the reason with its flag", async () => {
    await setWorktreeLock("/repo", "/repo/wt", true, "long build");
    expect(lastArgs()).toEqual([
      "-C",
      "/repo",
      "worktree",
      "lock",
      "--reason",
      "long build",
      "--",
      "/repo/wt",
    ]);
  });

  it("omits the reason flag when locking without one", async () => {
    await setWorktreeLock("/repo", "/repo/wt", true, undefined);
    expect(lastArgs()).toEqual([
      "-C",
      "/repo",
      "worktree",
      "lock",
      "--",
      "/repo/wt",
    ]);
  });

  it("separates the path operand on unlock", async () => {
    await setWorktreeLock("/repo", "/repo/wt", false, undefined);
    expect(lastArgs()).toEqual([
      "-C",
      "/repo",
      "worktree",
      "unlock",
      "--",
      "/repo/wt",
    ]);
  });

  it("prunes against the given repo only", async () => {
    await pruneWorktrees("/repo");
    expect(lastArgs()).toEqual(["-C", "/repo", "worktree", "prune"]);
  });

  it("puts the new branch with its flag and the operands after the separator on add", async () => {
    await createWorktree("/repo", "/repo/../wt", "feat/x", "origin/main");
    expect(lastArgs()).toEqual([
      "-C",
      "/repo",
      "worktree",
      "add",
      "-b",
      "feat/x",
      "--",
      "/repo/../wt",
      "origin/main",
    ]);
  });

  it("does not let a dash-leading worktree path become a flag on add", async () => {
    await createWorktree("/repo", "-f", "feat/x", "HEAD");
    const args = lastArgs();
    expect(args.indexOf("-f")).toBeGreaterThan(args.indexOf("--"));
  });

  it("separates both path operands on move", async () => {
    await moveWorktree("/repo", "/repo/wt", "/elsewhere/wt");
    expect(lastArgs()).toEqual([
      "-C",
      "/repo",
      "worktree",
      "move",
      "--",
      "/repo/wt",
      "/elsewhere/wt",
    ]);
  });

  it("does not let dash-leading paths become flags on move", async () => {
    await moveWorktree("/repo", "-f", "-g");
    const args = lastArgs();
    expect(args.indexOf("-f")).toBeGreaterThan(args.indexOf("--"));
    expect(args.indexOf("-g")).toBeGreaterThan(args.indexOf("--"));
  });

  it("repairs against the given repo only", async () => {
    await repairWorktrees("/repo");
    expect(lastArgs()).toEqual(["-C", "/repo", "worktree", "repair"]);
  });
});

describe("repairWorktrees", () => {
  beforeEach(() => {
    calls.length = 0;
    mock.stdout = "";
    mock.fail = false;
  });

  /**
   * git reports each file it fixed and prints nothing when there was no damage.
   * The caller distinguishes those outcomes, so an empty report has to stay
   * empty rather than becoming a generic success.
   */
  it("returns git's report of what it fixed", async () => {
    mock.stdout = "repair: .git file broken: /repo/wt\n";
    expect(await repairWorktrees("/repo")).toBe(
      "repair: .git file broken: /repo/wt",
    );
  });

  it("returns nothing when there was nothing to repair", async () => {
    expect(await repairWorktrees("/repo")).toBe("");
  });
});

describe("hasUpstream", () => {
  beforeEach(() => {
    calls.length = 0;
    mock.stdout = "";
    mock.fail = false;
  });

  it("asks git for the branch's upstream in the worktree's own directory", async () => {
    expect(await hasUpstream("/repo/wt")).toBe(true);
    expect(lastArgs()).toEqual([
      "-C",
      "/repo/wt",
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}",
    ]);
  });

  it("treats git's failure as no upstream, which is how git reports it", async () => {
    mock.fail = true;
    expect(await hasUpstream("/repo/wt")).toBe(false);
  });
});

describe("pushWorktree", () => {
  beforeEach(() => {
    calls.length = 0;
    mock.stdout = "";
    mock.fail = false;
  });

  it("pushes from the worktree's own directory", async () => {
    await pushWorktree("/repo/wt", undefined);
    expect(lastArgs()).toEqual(["-C", "/repo/wt", "push"]);
  });

  /**
   * A branch with no upstream cannot be pushed by a bare `git push`, and that is
   * the common case for a freshly created worktree — the whole point of the
   * extension. Setting the upstream is what makes the action work first time.
   */
  it("sets the upstream when the branch has none", async () => {
    await pushWorktree("/repo/wt", "feat/x");
    expect(lastArgs()).toEqual([
      "-C",
      "/repo/wt",
      "push",
      "--set-upstream",
      "origin",
      "--",
      "feat/x",
    ]);
  });

  it("does not let a dash-leading branch become a flag", async () => {
    await pushWorktree("/repo/wt", "-f");
    const args = lastArgs();
    expect(args.indexOf("-f")).toBeGreaterThan(args.indexOf("--"));
  });
});

describe("branch name validation", () => {
  beforeEach(() => {
    calls.length = 0;
    mock.stdout = "";
    mock.fail = false;
  });

  it("asks git rather than guessing at the rules", async () => {
    await isValidBranchName("/repo", "feat/x");
    expect(lastArgs()).toEqual([
      "-C",
      "/repo",
      "check-ref-format",
      "--branch",
      "feat/x",
    ]);
  });

  it("treats a git failure as an invalid name", async () => {
    mock.fail = true;
    expect(await isValidBranchName("/repo", "bad..name")).toBe(false);
  });

  it("rejects a dash-leading name without asking git, which would read it as a flag", async () => {
    expect(await isValidBranchName("/repo", "-force")).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("listStartPoints", () => {
  beforeEach(() => {
    calls.length = 0;
    mock.stdout = "";
    mock.fail = false;
  });

  it("lists local and remote refs by short name", async () => {
    mock.stdout = "main\nfeat/x\norigin/main\n";
    expect(await listStartPoints("/repo")).toEqual([
      "main",
      "feat/x",
      "origin/main",
    ]);
    expect(lastArgs()).toEqual([
      "-C",
      "/repo",
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/heads",
      "refs/remotes",
    ]);
  });

  it("drops the origin/HEAD alias, which is not a useful start point", async () => {
    mock.stdout = "main\norigin/HEAD\norigin/main\n";
    expect(await listStartPoints("/repo")).toEqual(["main", "origin/main"]);
  });

  it("returns nothing rather than throwing when git fails", async () => {
    mock.fail = true;
    expect(await listStartPoints("/repo")).toEqual([]);
  });
});

describe("getWorktreeTimestamps", () => {
  function worktree(overrides: Record<string, unknown> = {}) {
    return {
      path: "/repo/wt",
      head: "a".repeat(40),
      branch: "feat/x",
      isBare: false,
      isDetached: false,
      isLocked: false,
      isPrunable: false,
      ...overrides,
    };
  }

  beforeEach(() => {
    calls.length = 0;
    mock.stdout = "";
    mock.fail = false;
    statMock.entries.clear();
  });

  /**
   * One `rev-list` for every worktree rather than one per worktree: the sort
   * runs on each refresh, and a per-worktree process would put a git spawn
   * behind every keystroke in the filter box.
   */
  it("asks for every head in a single call", async () => {
    const first = "1".repeat(40);
    const second = "2".repeat(40);
    mock.stdout = `commit ${first}\n${first} 500\ncommit ${second}\n${second} 400\n`;

    const times = await getWorktreeTimestamps("/repo", [
      worktree({ path: "/repo/a", head: first }),
      worktree({ path: "/repo/b", head: second }),
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([
      "-C",
      "/repo",
      "rev-list",
      "--no-walk",
      "--ignore-missing",
      "--format=%H %ct",
      first,
      second,
    ]);
    expect(times.get("/repo/a")?.lastCommit).toBe(500);
    expect(times.get("/repo/b")?.lastCommit).toBe(400);
  });

  it("gives worktrees on the same commit the same time from one argument", async () => {
    const head = "3".repeat(40);
    mock.stdout = `commit ${head}\n${head} 700\n`;

    const times = await getWorktreeTimestamps("/repo", [
      worktree({ path: "/repo/a", head }),
      worktree({ path: "/repo/b", head }),
    ]);

    // git collapses a repeated argument, so a per-worktree lookup would have
    // left the second one blank.
    expect(times.get("/repo/a")?.lastCommit).toBe(700);
    expect(times.get("/repo/b")?.lastCommit).toBe(700);
  });

  it("skips git altogether when no worktree has a head", async () => {
    const times = await getWorktreeTimestamps("/repo", [
      worktree({ path: "/repo/a", head: undefined }),
    ]);

    // A `rev-list` with no revision argument is a usage error, not an empty result.
    expect(calls).toHaveLength(0);
    expect(times.get("/repo/a")?.lastCommit).toBeUndefined();
  });

  it("leaves the commit time out rather than guessing when git fails", async () => {
    mock.fail = true;
    const times = await getWorktreeTimestamps("/repo", [worktree()]);
    expect(times.get("/repo/wt")?.lastCommit).toBeUndefined();
  });

  /**
   * A linked worktree's `.git` file is written once, when the worktree is
   * created, and git rewrites it only on `worktree move` — which is a
   * re-creation as far as "when did this appear here" goes.
   */
  it("reads creation time from the linked worktree's .git file", async () => {
    statMock.entries.set("/repo/wt/.git", { mtimeMs: 1234, isFile: true });
    const times = await getWorktreeTimestamps("/repo", [worktree()]);
    expect(times.get("/repo/wt")?.created).toBe(1234);
  });

  /**
   * The main worktree's `.git` is a directory, and its mtime moves with every
   * commit, fetch and gc. Reading it would report last activity as a creation
   * time, floating the main worktree to the top of a newest-first order.
   */
  it("has no creation time for the main worktree, whose .git is a directory", async () => {
    statMock.entries.set("/repo/.git", { mtimeMs: 9999, isFile: false });
    const times = await getWorktreeTimestamps("/repo", [
      worktree({ path: "/repo" }),
    ]);
    expect(times.get("/repo")?.created).toBeUndefined();
  });

  it("leaves creation time out when the worktree directory is gone", async () => {
    const times = await getWorktreeTimestamps("/repo", [
      worktree({ isPrunable: true }),
    ]);
    expect(times.get("/repo/wt")?.created).toBeUndefined();
  });

  it("keys results by resolved path so a trailing slash still matches", async () => {
    statMock.entries.set("/repo/wt/.git", { mtimeMs: 99, isFile: true });
    const times = await getWorktreeTimestamps("/repo", [
      worktree({ path: "/repo/wt/" }),
    ]);
    expect(times.get("/repo/wt")?.created).toBe(99);
  });

  it("ignores a commit line for a head no worktree is on", async () => {
    const head = "4".repeat(40);
    const stranger = "5".repeat(40);
    mock.stdout = `commit ${stranger}\n${stranger} 800\ncommit ${head}\n${head} 600\n`;

    const times = await getWorktreeTimestamps("/repo", [worktree({ head })]);

    expect(times.get("/repo/wt")?.lastCommit).toBe(600);
  });
});
