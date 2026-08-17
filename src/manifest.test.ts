import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import manifest from "../package.json";
import { RemovalContext, checkWorktreeRemovable } from "./removal";
import { Worktree } from "./types";

vi.mock("vscode", () => ({}), { virtual: true });

import { WORKTREE_SORT_MODES } from "./display";
import { VIEW_ID } from "./extension";
import { buildContextValue, repoContextValue } from "./views/worktreeTree";

/**
 * `package.json` is data and the code that answers to it is strings, so nothing
 * in the compiler or the linter notices when the two drift apart. These tests
 * are that missing check: a command renamed on one side, a `when` clause that no
 * longer matches any row, or a setting declared and never read all fail here.
 */

const SRC_DIR = path.resolve(__dirname);

function sourceFiles(): string[] {
  return readdirSync(SRC_DIR, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => path.join(SRC_DIR, file));
}

function allSource(): string {
  return sourceFiles()
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

function matchAll(source: string, pattern: RegExp): string[] {
  return [...new Set([...source.matchAll(pattern)].map((m) => m[1]))].sort();
}

interface MenuEntry {
  command: string;
  when?: string;
  group?: string;
}

const menus = manifest.contributes.menus as Record<string, MenuEntry[]>;
const declaredCommands = manifest.contributes.commands;
const declaredIds = declaredCommands.map((command) => command.command).sort();
const registeredIds = matchAll(
  allSource(),
  /registerCommand\(\s*"([^"]+)"/g,
);

describe("contributes.commands against registerCommand", () => {
  it("declares every command the extension registers", () => {
    expect(declaredIds).toEqual(registeredIds);
  });

  it("registers a handler for every declared command", () => {
    // Same assertion from the other side: a declared-but-unregistered command
    // still appears in the palette and fails with "command not found".
    expect(registeredIds).toEqual(declaredIds);
  });

  it("declares each command exactly once", () => {
    expect(new Set(declaredIds).size).toBe(declaredIds.length);
  });
});

describe("contributes.menus command references", () => {
  const referenced = [
    ...new Set(
      Object.values(menus)
        .flat()
        .map((entry) => entry.command),
    ),
  ].sort();

  it("only references commands that are declared", () => {
    expect(referenced.filter((command) => !declaredIds.includes(command))).toEqual(
      [],
    );
  });

  it("scopes every tree-row entry to this extension's view", () => {
    // Without the view guard these entries appear on rows of every other tree
    // in the editor, where the command would receive a foreign node.
    const unscoped = menus["view/item/context"].filter(
      (entry) => !entry.when?.includes(`view == ${VIEW_ID}`),
    );

    expect(unscoped).toEqual([]);
  });

  it("declares the view id the code registers the tree under", () => {
    expect(Object.keys(manifest.contributes.views)).toContain("explorer");
    expect(manifest.contributes.views.explorer.map((view) => view.id)).toContain(
      VIEW_ID,
    );
  });
});

describe("command palette presentation", () => {
  const hiddenFromPalette = new Set(
    (menus.commandPalette ?? [])
      .filter((entry) => entry.when === "false")
      .map((entry) => entry.command),
  );

  it("gives every palette-visible command a category so it groups under one prefix", () => {
    const uncategorised = declaredCommands
      .filter((command) => !hiddenFromPalette.has(command.command))
      .filter((command) => !("category" in command) || !command.category)
      .map((command) => command.command);

    expect(uncategorised).toEqual([]);
  });

  it("uses one category for all of them", () => {
    const categories = new Set(
      declaredCommands
        .map((command) => ("category" in command ? command.category : undefined))
        .filter(Boolean),
    );

    expect([...categories]).toEqual(["Worktrees"]);
  });

  it("hides only commands that duplicate another entry's behaviour", () => {
    // unlockInline exists solely to carry an open-padlock icon on a locked row;
    // in the palette it would read as a second, different unlock command.
    expect([...hiddenFromPalette]).toEqual([
      "betterWorktrees.worktree.unlockInline",
    ]);
  });
});

describe("contributes.configuration against config.ts", () => {
  const SECTION = "betterWorktrees.";
  const declaredSettings = Object.keys(
    manifest.contributes.configuration.properties,
  ).sort();
  const readInConfig = matchAll(
    readFileSync(path.join(SRC_DIR, "config.ts"), "utf8"),
    /\.get<[\s\S]*?>\(\s*"([^"]+)"/g,
  ).map((key) => `${SECTION}${key}`);
  const watched = matchAll(
    allSource(),
    /affectsConfiguration\(\s*"([^"]+)"/g,
  );

  it("declares every setting config.ts reads", () => {
    expect(readInConfig.filter((key) => !declaredSettings.includes(key))).toEqual(
      [],
    );
  });

  it("has no declared setting that nothing reads", () => {
    // A setting shown in the Settings UI that no code consults is a promise the
    // extension does not keep.
    expect(declaredSettings.filter((key) => !readInConfig.includes(key))).toEqual(
      [],
    );
  });

  it("watches only settings that exist", () => {
    expect(watched.filter((key) => !declaredSettings.includes(key))).toEqual([]);
  });

  /**
   * The sort modes are a second string coupling: the manifest enum is what the
   * Settings UI offers, and `sortBy` in config.ts only accepts what the code
   * knows. A value in one and not the other is either an option that silently
   * falls back to the default or a mode the user cannot reach.
   */
  it("offers exactly the sort modes the code implements", () => {
    const sortBy =
      manifest.contributes.configuration.properties["betterWorktrees.sortBy"];

    expect([...sortBy.enum].sort()).toEqual([...WORKTREE_SORT_MODES].sort());
    expect(sortBy.enumDescriptions).toHaveLength(sortBy.enum.length);
  });

  it("offers every sort mode in the picker", () => {
    // The setting and the picker are separate lists; a mode missing from the
    // picker is only reachable by hand-editing settings.json.
    const offered = matchAll(
      readFileSync(path.join(SRC_DIR, "commands", "view.ts"), "utf8"),
      /mode:\s*"([^"]+)"/g,
    );

    expect(offered).toEqual([...WORKTREE_SORT_MODES].sort());
  });

  it("declares every theme colour id the code asks for", () => {
    const declaredColors = new Set(
      manifest.contributes.colors.map((color) => color.id),
    );
    const referenced = matchAll(
      allSource(),
      /"(betterWorktrees\.worktree(?:Color|Type)[A-Za-z]*)"/g,
    ).filter((id) => !id.endsWith("worktreeType"));

    expect(referenced.filter((id) => !declaredColors.has(id))).toEqual([]);
  });
});

/**
 * The half of the coupling that has actually broken: a row's `contextValue`
 * decides which menu entries the editor renders, and the manifest matches that
 * string with regexes. Renaming a state on either side silently empties a menu,
 * so these tests evaluate the real `when` clauses against the real strings.
 */

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

/**
 * Evaluates the subset of the `when` language these menus use. Unknown syntax
 * throws rather than defaulting to false, so a new clause form cannot slip past
 * these tests by silently evaluating to "hidden".
 */
function whenMatches(clause: string, viewItem: string): boolean {
  return clause.split("&&").every((raw) => {
    const term = raw.trim();

    const equality = /^(view|viewItem) == (\S+)$/.exec(term);
    if (equality) {
      const actual = equality[1] === "view" ? VIEW_ID : viewItem;
      return actual === equality[2];
    }

    const regex = /^viewItem =~ \/(.+)\/$/.exec(term);
    if (regex) {
      return new RegExp(regex[1]).test(viewItem);
    }

    throw new Error(`Unsupported when clause term: ${term}`);
  });
}

function entriesFor(viewItem: string): MenuEntry[] {
  return menus["view/item/context"].filter((entry) =>
    whenMatches(entry.when ?? "", viewItem),
  );
}

function commandsFor(viewItem: string): string[] {
  return [...new Set(entriesFor(viewItem).map((entry) => entry.command))].sort();
}

function inlineCommandsFor(viewItem: string): string[] {
  return entriesFor(viewItem)
    .filter((entry) => entry.group?.startsWith("inline"))
    .map((entry) => entry.command)
    .sort();
}

/** Every row state the tree can put in front of a user, with its exact string. */
const WORKTREE_ROWS = {
  linked: {
    worktree: worktree(),
    context: context(),
    contextValue: "worktree.removable.unlocked.lockable",
  },
  main: {
    worktree: worktree({ path: "/repo", branch: "main" }),
    context: context({ isMainWorktree: true }),
    contextValue: "worktree.unlocked.lockable",
  },
  currentWindow: {
    worktree: worktree(),
    context: context({ isCurrentWindow: true }),
    contextValue: "worktree.unlocked.lockable",
  },
  locked: {
    worktree: worktree({ isLocked: true, lockReason: "waiting for CI" }),
    context: context(),
    contextValue: "worktree.locked.lockable",
  },
  stale: {
    worktree: worktree({ isPrunable: true, prunableReason: "gitdir missing" }),
    context: context(),
    contextValue: "worktree.unlocked.prunable",
  },
  lockedAndStale: {
    worktree: worktree({ isLocked: true, isPrunable: true }),
    context: context(),
    contextValue: "worktree.locked.prunable",
  },
  bare: {
    worktree: worktree({ path: "/repo.git", branch: undefined, isBare: true }),
    context: context(),
    contextValue: "worktree.unlocked.lockable",
  },
} as const;

type RowName = keyof typeof WORKTREE_ROWS;
const ROW_NAMES = Object.keys(WORKTREE_ROWS) as RowName[];

/**
 * The string the tree would actually put on the row, not the literal above. The
 * menu assertions run against this so renaming a flag in `buildContextValue`
 * fails them too, rather than only failing the pinned-string test.
 */
function viewItemFor(name: RowName): string {
  const row = WORKTREE_ROWS[name];
  return buildContextValue(row.worktree, row.context);
}

describe("buildContextValue", () => {
  it.each(ROW_NAMES)("encodes the %s row as its documented string", (name) => {
    const row = WORKTREE_ROWS[name];

    expect(buildContextValue(row.worktree, row.context)).toBe(row.contextValue);
  });

  it("always starts with worktree so the row-kind regexes can anchor on it", () => {
    ROW_NAMES.forEach((name) => {
      expect(viewItemFor(name).startsWith("worktree")).toBe(true);
    });
  });

  it("marks a row removable exactly when the remove command would accept it", () => {
    ROW_NAMES.forEach((name) => {
      const row = WORKTREE_ROWS[name];

      expect(buildContextValue(row.worktree, row.context).includes(".removable")).toBe(
        checkWorktreeRemovable(row.worktree, row.context).removable,
      );
    });
  });

  it("never labels a row both locked and unlocked", () => {
    ROW_NAMES.forEach((name) => {
      const value = viewItemFor(name);

      expect(value.includes(".locked") !== value.includes(".unlocked")).toBe(true);
    });
  });
});

describe("repoContextValue", () => {
  it("plainly names a repository with nothing to prune", () => {
    expect(repoContextValue([worktree()])).toBe("repo");
  });

  it("flags a repository that has a stale worktree", () => {
    expect(repoContextValue([worktree(), worktree({ isPrunable: true })])).toBe(
      "repo.hasStale",
    );
  });

  it("treats a repository with no worktrees as having nothing stale", () => {
    expect(repoContextValue([])).toBe("repo");
  });
});

describe("worktree row menus", () => {
  const ALWAYS_AVAILABLE = [
    "betterWorktrees.worktree.addToWorkspace",
    "betterWorktrees.worktree.copyBranch",
    "betterWorktrees.worktree.copyPath",
    "betterWorktrees.worktree.fetch",
    "betterWorktrees.worktree.openInCurrentWindow",
    "betterWorktrees.worktree.openInNewWindow",
    "betterWorktrees.worktree.openTerminal",
    "betterWorktrees.worktree.pull",
    "betterWorktrees.worktree.push",
    "betterWorktrees.worktree.remove",
    "betterWorktrees.worktree.removeFromWorkspace",
    "betterWorktrees.worktree.reveal",
    "betterWorktrees.worktree.revealInExplorerView",
    "betterWorktrees.worktree.revealInSourceControl",
  ];

  it("offers the read-only actions on every worktree row", () => {
    const harmless = ALWAYS_AVAILABLE.filter(
      (command) => command !== "betterWorktrees.worktree.remove",
    );

    ROW_NAMES.forEach((name) => {
      expect(commandsFor(viewItemFor(name))).toEqual(
        expect.arrayContaining(harmless),
      );
    });
  });

  it("offers remove and move only on a row the remove command would accept", () => {
    ROW_NAMES.forEach((name) => {
      const row = WORKTREE_ROWS[name];
      const commands = commandsFor(viewItemFor(name));
      const removable = checkWorktreeRemovable(row.worktree, row.context)
        .removable;

      expect(commands.includes("betterWorktrees.worktree.remove")).toBe(removable);
      // Move is gated on the same flag, so a row that cannot be removed cannot
      // be relocated either — both would leave the open folder dangling.
      expect(commands.includes("betterWorktrees.worktree.move")).toBe(removable);
    });
  });

  it("hides remove from the main, current-window, locked, stale and bare rows", () => {
    (
      ["main", "currentWindow", "locked", "stale", "lockedAndStale", "bare"] as const
    ).forEach((name) => {
      expect(commandsFor(viewItemFor(name))).not.toContain(
        "betterWorktrees.worktree.remove",
      );
    });
  });

  it("never shows both padlock buttons on one row", () => {
    ROW_NAMES.forEach((name) => {
      const inline = inlineCommandsFor(viewItemFor(name));
      const padlocks = inline.filter(
        (command) =>
          command === "betterWorktrees.worktree.toggleLock" ||
          command === "betterWorktrees.worktree.unlockInline",
      );

      expect(padlocks.length).toBeLessThanOrEqual(1);
    });
  });

  it("shows the closed padlock on an unlocked row and the open one on a locked row", () => {
    expect(inlineCommandsFor(viewItemFor("linked"))).toContain(
      "betterWorktrees.worktree.toggleLock",
    );
    expect(inlineCommandsFor(viewItemFor("locked"))).toContain(
      "betterWorktrees.worktree.unlockInline",
    );
  });

  it("offers no lock action on a stale row, whose directory is already gone", () => {
    (["stale", "lockedAndStale"] as const).forEach((name) => {
      expect(commandsFor(viewItemFor(name))).not.toContain(
        "betterWorktrees.worktree.toggleLock",
      );
      expect(commandsFor(viewItemFor(name))).not.toContain(
        "betterWorktrees.worktree.unlockInline",
      );
    });
  });

  it("offers no repository action on a worktree row", () => {
    ROW_NAMES.forEach((name) => {
      expect(commandsFor(viewItemFor(name))).not.toContain(
        "betterWorktrees.addWorktreesToSourceControl",
      );
    });
  });
});

describe("repository row menus", () => {
  const CLEAN = repoContextValue([worktree()]);
  const STALE = repoContextValue([worktree({ isPrunable: true })]);

  const REPO_COMMANDS = [
    "betterWorktrees.addWorktreesToSourceControl",
    "betterWorktrees.checkoutWorktree",
    "betterWorktrees.createWorktree",
    "betterWorktrees.pruneWorktrees",
    "betterWorktrees.repairWorktrees",
    "betterWorktrees.worktreeFromPullRequest",
  ];

  // The regression this file exists for: narrowing a repository clause to one
  // of the two contextValues empties the whole repository menu on the other.
  it("offers every repository action on a repository with nothing stale", () => {
    expect(commandsFor(CLEAN)).toEqual(REPO_COMMANDS);
  });

  it("offers every repository action on a repository that has stale worktrees", () => {
    expect(commandsFor(STALE)).toEqual(REPO_COMMANDS);
  });

  it("shows the inline prune button only where there is something to prune", () => {
    expect(inlineCommandsFor(STALE)).toContain("betterWorktrees.pruneWorktrees");
    expect(inlineCommandsFor(CLEAN)).not.toContain(
      "betterWorktrees.pruneWorktrees",
    );
  });

  it("offers no worktree action on a repository row", () => {
    [CLEAN, STALE].forEach((viewItem) => {
      expect(commandsFor(viewItem)).not.toEqual(
        expect.arrayContaining(["betterWorktrees.worktree.remove"]),
      );
      expect(commandsFor(viewItem)).not.toEqual(
        expect.arrayContaining(["betterWorktrees.worktree.toggleLock"]),
      );
    });
  });

  it("reaches every view/item/context entry from some row", () => {
    // An entry no row can satisfy is dead weight that reads as a working
    // feature; this is what a renamed state leaves behind.
    const rows = [
      ...ROW_NAMES.map(viewItemFor),
      CLEAN,
      STALE,
    ];
    const reachable = new Set(rows.flatMap((viewItem) => entriesFor(viewItem)));

    const unreachable = menus["view/item/context"].filter(
      (entry) => !reachable.has(entry),
    );

    expect(unreachable).toEqual([]);
  });
});
