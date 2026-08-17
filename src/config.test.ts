import { beforeEach, describe, expect, it, vi } from "vitest";

const stored: Record<string, unknown> = {};

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key: string, fallback: unknown) =>
        key in stored ? stored[key] : fallback,
    }),
  },
}));

import { sortBy } from "./config";

/**
 * `sortBy` replaced the `sortDirtyFirst` boolean, and both are still read. The
 * precedence between them is the part that can quietly regress: an existing
 * boolean has to keep working, without overriding a mode the user picked later.
 */
describe("sortBy", () => {
  beforeEach(() => {
    for (const key of Object.keys(stored)) {
      delete stored[key];
    }
  });

  it("sorts by branch when nothing is configured", () => {
    expect(sortBy()).toBe("branch");
  });

  it("honours the superseded boolean on its own", () => {
    stored.sortDirtyFirst = true;
    expect(sortBy()).toBe("dirtyFirst");
  });

  it("takes an explicit mode over the superseded boolean", () => {
    stored.sortBy = "lastCommit";
    stored.sortDirtyFirst = true;
    expect(sortBy()).toBe("lastCommit");
  });

  /**
   * `branch` is the default, so it cannot be told apart from unset. Treating it
   * as unset is what lets an existing `sortDirtyFirst` keep working, and picking
   * `branch` in the picker clears the boolean rather than relying on this.
   */
  it("still honours the boolean while the mode is left at its default", () => {
    stored.sortBy = "branch";
    stored.sortDirtyFirst = true;
    expect(sortBy()).toBe("dirtyFirst");
  });

  it("ignores a mode it does not know", () => {
    stored.sortBy = "nonsense";
    expect(sortBy()).toBe("branch");
  });

  it("returns each of the timestamp modes as given", () => {
    stored.sortBy = "created";
    expect(sortBy()).toBe("created");
    stored.sortBy = "lastCommit";
    expect(sortBy()).toBe("lastCommit");
  });
});
