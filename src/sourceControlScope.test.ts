import { describe, expect, it, vi } from "vitest";
import {
  addWorktreesToSourceControl,
  AddWorktreesDependencies,
  addWorktreeToSourceControl,
  getWorktreePathsToRegister,
  restoreSourceControlScope,
  ScopeSourceControlDependencies,
  scopeSourceControlToWorktree,
} from "./sourceControlScope";
import { Worktree } from "./types";

const TARGET = "/repo/.worktrees/feature";
const OTHERS = ["/repo", "/repo/.worktrees/hotfix"];

function createDeps(
  overrides: Partial<ScopeSourceControlDependencies> = {},
): ScopeSourceControlDependencies {
  return {
    listRegisteredRepositories: vi.fn(async () => [TARGET, ...OTHERS]),
    openRepository: vi.fn(async () => true),
    closeRepository: vi.fn(async () => {}),
    notifications: {
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    },
    ...overrides,
  };
}

describe("scopeSourceControlToWorktree", () => {
  it("closes every registered repository except the target", async () => {
    const deps = createDeps();

    const closed = await scopeSourceControlToWorktree(TARGET, deps);

    expect(closed).toEqual(OTHERS);
    expect(deps.closeRepository).toHaveBeenCalledTimes(2);
    expect(deps.closeRepository).toHaveBeenCalledWith("/repo");
    expect(deps.closeRepository).toHaveBeenCalledWith("/repo/.worktrees/hotfix");
  });

  it("registers the target before closing anything else", async () => {
    const order: string[] = [];
    const deps = createDeps({
      openRepository: vi.fn(async (p: string) => {
        order.push(`open:${p}`);
        return true;
      }),
      closeRepository: vi.fn(async (p: string) => {
        order.push(`close:${p}`);
      }),
    });

    await scopeSourceControlToWorktree(TARGET, deps);

    expect(order[0]).toBe(`open:${TARGET}`);
    expect(order.slice(1)).toEqual(OTHERS.map((p) => `close:${p}`));
  });

  it("never closes the target when paths differ only by normalization", async () => {
    const deps = createDeps({
      listRegisteredRepositories: vi.fn(async () => [
        "/repo/.worktrees/feature/",
        "/repo/./.worktrees/feature",
        "/repo",
      ]),
    });

    const closed = await scopeSourceControlToWorktree(TARGET, deps);

    expect(closed).toEqual(["/repo"]);
    expect(deps.closeRepository).toHaveBeenCalledTimes(1);
    expect(deps.closeRepository).toHaveBeenCalledWith("/repo");
  });

  it("closes nothing and warns when the target cannot be registered", async () => {
    const deps = createDeps({ openRepository: vi.fn(async () => false) });

    const closed = await scopeSourceControlToWorktree(TARGET, deps);

    expect(closed).toBeNull();
    expect(deps.closeRepository).not.toHaveBeenCalled();
    expect(deps.notifications.warning).toHaveBeenCalledWith(
      expect.stringContaining("Could not open this worktree"),
    );
  });

  it("is a no-op when the target is the only registered repository", async () => {
    const deps = createDeps({
      listRegisteredRepositories: vi.fn(async () => [TARGET]),
    });

    const closed = await scopeSourceControlToWorktree(TARGET, deps);

    expect(closed).toEqual([]);
    expect(deps.closeRepository).not.toHaveBeenCalled();
  });
});

describe("addWorktreeToSourceControl", () => {
  it("registers the worktree without closing anything", async () => {
    const deps = createDeps({
      listRegisteredRepositories: vi.fn(async () => OTHERS),
    });

    expect(await addWorktreeToSourceControl(makeWorktree({ path: TARGET }), deps)).toBe(
      true,
    );
    expect(deps.openRepository).toHaveBeenCalledWith(TARGET);
    expect(deps.closeRepository).not.toHaveBeenCalled();
  });

  /**
   * Registering an already-open repository is a no-op in the editor, so a
   * silent success would look like nothing happened at all.
   */
  it("says so and skips the call when the worktree is already there", async () => {
    const deps = createDeps();

    expect(
      await addWorktreeToSourceControl(
        makeWorktree({ path: TARGET, branch: "feature" }),
        deps,
      ),
    ).toBe(false);
    expect(deps.openRepository).not.toHaveBeenCalled();
    expect(deps.notifications.info).toHaveBeenCalledWith(
      expect.stringContaining("already in the Source Control view"),
    );
  });

  it("recognises an already-registered worktree across path normalization", async () => {
    const deps = createDeps({
      listRegisteredRepositories: vi.fn(async () => [`${TARGET}/`, "/repo"]),
    });

    expect(await addWorktreeToSourceControl(makeWorktree({ path: TARGET }), deps)).toBe(
      false,
    );
    expect(deps.openRepository).not.toHaveBeenCalled();
  });

  it("warns when the worktree could not be registered", async () => {
    const deps = createDeps({
      listRegisteredRepositories: vi.fn(async () => OTHERS),
      openRepository: vi.fn(async () => false),
    });

    expect(await addWorktreeToSourceControl(makeWorktree({ path: TARGET }), deps)).toBe(
      false,
    );
    expect(deps.notifications.warning).toHaveBeenCalledWith(
      expect.stringContaining("Could not add this worktree"),
    );
  });

  it("refuses a bare repository, which has no working copy to show", async () => {
    const deps = createDeps({
      listRegisteredRepositories: vi.fn(async () => OTHERS),
    });

    expect(
      await addWorktreeToSourceControl(
        makeWorktree({ path: "/repo/bare", isBare: true }),
        deps,
      ),
    ).toBe(false);
    expect(deps.openRepository).not.toHaveBeenCalled();
    expect(deps.notifications.warning).toHaveBeenCalled();
  });
});

describe("restoreSourceControlScope", () => {
  it("reopens every remembered path and reports the count", async () => {
    const deps = createDeps();

    const restored = await restoreSourceControlScope(OTHERS, deps);

    expect(restored).toBe(2);
    expect(deps.openRepository).toHaveBeenCalledWith("/repo");
    expect(deps.openRepository).toHaveBeenCalledWith("/repo/.worktrees/hotfix");
  });

  it("deduplicates paths so a repository is only reopened once", async () => {
    const deps = createDeps();

    const restored = await restoreSourceControlScope(
      ["/repo", "/repo/", "/repo/./"],
      deps,
    );

    expect(restored).toBe(1);
    expect(deps.openRepository).toHaveBeenCalledTimes(1);
  });

  it("counts only the repositories that actually reopened", async () => {
    const deps = createDeps({
      openRepository: vi.fn(async (p: string) => p !== "/repo"),
    });

    const restored = await restoreSourceControlScope(OTHERS, deps);

    expect(restored).toBe(1);
  });
});

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: "/repos/main",
    isBare: false,
    isDetached: false,
    isLocked: false,
    isPrunable: false,
    ...overrides,
  };
}

function createAddDeps(
  overrides: Partial<AddWorktreesDependencies> = {},
): AddWorktreesDependencies {
  return {
    listWorktrees: vi.fn().mockResolvedValue([]),
    openRepository: vi.fn().mockResolvedValue(true),
    notifications: { info: vi.fn(), warning: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

describe("getWorktreePathsToRegister", () => {
  it("excludes bare worktrees, which have no working copy to show", () => {
    const worktrees: Worktree[] = [
      makeWorktree({ path: "/repos/main", branch: "main" }),
      makeWorktree({ path: "/repos/bare", isBare: true }),
      makeWorktree({ path: "/repos/feature", branch: "feature" }),
    ];

    expect(getWorktreePathsToRegister(worktrees)).toEqual([
      "/repos/main",
      "/repos/feature",
    ]);
  });
});

describe("addWorktreesToSourceControl", () => {
  it("registers every non-bare worktree", async () => {
    const deps = createAddDeps({
      listWorktrees: vi.fn().mockResolvedValue([
        makeWorktree({ path: "/repos/main", branch: "main" }),
        makeWorktree({ path: "/repos/feature", branch: "feature" }),
      ]),
    });

    await addWorktreesToSourceControl("/repos/main", deps);

    expect(deps.openRepository).toHaveBeenCalledTimes(2);
    expect(deps.openRepository).toHaveBeenCalledWith("/repos/main");
    expect(deps.openRepository).toHaveBeenCalledWith("/repos/feature");
    expect(deps.notifications.info).toHaveBeenCalled();
  });

  it("warns when the folder has no worktrees", async () => {
    const deps = createAddDeps({
      listWorktrees: vi.fn().mockResolvedValue([]),
    });

    await addWorktreesToSourceControl("/not/a/repo", deps);

    expect(deps.openRepository).not.toHaveBeenCalled();
    expect(deps.notifications.warning).toHaveBeenCalled();
  });

  it("warns when nothing could be registered", async () => {
    const deps = createAddDeps({
      listWorktrees: vi
        .fn()
        .mockResolvedValue([makeWorktree({ branch: "main" })]),
      openRepository: vi.fn().mockResolvedValue(false),
    });

    await addWorktreesToSourceControl("/repos/main", deps);

    expect(deps.notifications.warning).toHaveBeenCalled();
    expect(deps.notifications.info).not.toHaveBeenCalled();
  });
});
