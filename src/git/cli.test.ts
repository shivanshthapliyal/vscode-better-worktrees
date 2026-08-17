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

import {
  createWorktree,
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
