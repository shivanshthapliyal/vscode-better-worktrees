import { describe, expect, it } from "vitest";
import {
  checkWorktreeRemovable,
  describeRemoval,
  RemovalContext,
  selectStaleGroups,
} from "./removal";
import { Worktree } from "./types";

function worktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: "/repo/.worktrees/feature",
    head: "1111111111111111111111111111111111111111",
    branch: "feature/login",
    isBare: false,
    isDetached: false,
    isLocked: false,
    isPrunable: false,
    ...overrides,
  };
}

function context(overrides: Partial<RemovalContext> = {}): RemovalContext {
  return { isMainWorktree: false, isCurrentWindow: false, ...overrides };
}

describe("checkWorktreeRemovable", () => {
  it("allows removing an ordinary linked worktree", () => {
    expect(checkWorktreeRemovable(worktree(), context())).toEqual({
      removable: true,
    });
  });

  it("refuses to remove the main worktree", () => {
    const result = checkWorktreeRemovable(
      worktree(),
      context({ isMainWorktree: true }),
    );

    expect(result.removable).toBe(false);
    expect(result).toHaveProperty("reason", expect.stringContaining("main"));
  });

  it("refuses to remove a bare repository", () => {
    const result = checkWorktreeRemovable(
      worktree({ isBare: true }),
      context(),
    );

    expect(result.removable).toBe(false);
  });

  it("refuses to remove the worktree open in this window", () => {
    const result = checkWorktreeRemovable(
      worktree(),
      context({ isCurrentWindow: true }),
    );

    expect(result.removable).toBe(false);
    expect(result).toHaveProperty(
      "reason",
      expect.stringContaining("this window"),
    );
  });

  it("refuses to remove a locked worktree and names the lock reason", () => {
    const result = checkWorktreeRemovable(
      worktree({ isLocked: true, lockReason: "waiting for CI" }),
      context(),
    );

    expect(result.removable).toBe(false);
    expect(result).toHaveProperty(
      "reason",
      expect.stringContaining("waiting for CI"),
    );
  });

  it("routes prunable worktrees to prune instead of remove", () => {
    const result = checkWorktreeRemovable(
      worktree({ isPrunable: true, prunableReason: "gitdir file missing" }),
      context(),
    );

    expect(result.removable).toBe(false);
    expect(result).toHaveProperty("reason", expect.stringContaining("Prune"));
  });

  it("checks the main worktree before anything else", () => {
    const result = checkWorktreeRemovable(
      worktree({ isLocked: true }),
      context({ isMainWorktree: true }),
    );

    expect(result).toHaveProperty("reason", expect.stringContaining("main"));
  });
});

describe("describeRemoval", () => {
  it("warns about uncommitted changes and requires force", () => {
    const result = describeRemoval(worktree(), 3);

    expect(result.requiresForce).toBe(true);
    expect(result.detail).toContain("3");
  });

  it("does not require force for a clean worktree", () => {
    const result = describeRemoval(worktree(), 0);

    expect(result.requiresForce).toBe(false);
  });

  it("names the branch when there is one", () => {
    expect(describeRemoval(worktree(), 0).message).toContain("feature/login");
  });

  it("identifies a detached worktree by its short HEAD, with the path in the detail", () => {
    const result = describeRemoval(
      worktree({ branch: undefined, isDetached: true }),
      0,
    );

    expect(result.message).toContain("detached @ 1111111");
    expect(result.detail).toContain("/repo/.worktrees/feature");
  });
});

describe("selectStaleGroups", () => {
  const stale = worktree({ path: "/repo/.worktrees/gone", isPrunable: true });

  it("returns nothing when no group has stale worktrees", () => {
    expect(selectStaleGroups([{ worktrees: [worktree()] }])).toEqual([]);
  });

  it("keeps only the groups that have stale worktrees", () => {
    const clean = { name: "clean", worktrees: [worktree()] };
    const dirty = { name: "dirty", worktrees: [worktree(), stale] };

    const result = selectStaleGroups([clean, dirty]);

    expect(result).toHaveLength(1);
    expect(result[0].group).toBe(dirty);
  });

  it("reports the stale worktrees so the confirmation can list them", () => {
    const result = selectStaleGroups([{ worktrees: [worktree(), stale] }]);

    expect(result[0].stale).toEqual([stale]);
  });
});
