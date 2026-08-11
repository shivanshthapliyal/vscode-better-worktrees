import * as vscode from "vscode";
import {
  BranchType,
  DEFAULT_BRANCH_TYPE_MAP,
} from "./display";
import { DEFAULT_WORKTREE_PATH_TEMPLATE } from "./worktreePath";

/**
 * Every setting this extension reads, in one place. Settings are looked up on
 * each call rather than cached because VS Code lets the user change them at any
 * time and there is no reload between a change and the next command.
 */

const SECTION = "betterWorktrees";
const DEFAULT_SCAN_DEPTH = 3;

export type OpenTarget = "newWindow" | "currentWindow";
export type ColorMode = "branch" | "branchType";

const BRANCH_TYPES: readonly BranchType[] = [
  "main",
  "feature",
  "fix",
  "release",
  "chore",
  "other",
];

function settings(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(SECTION);
}

export function showNotifications(): boolean {
  return settings().get<boolean>("showNotifications", true);
}

export function openWorktreeIn(): OpenTarget {
  return settings().get<string>("openWorktreeIn", "newWindow") ===
    "currentWindow"
    ? "currentWindow"
    : "newWindow";
}

export function scanDepth(): number {
  const value = settings().get<number>("scanDepth", DEFAULT_SCAN_DEPTH);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_SCAN_DEPTH;
}

export function worktreePathTemplate(): string {
  return settings().get<string>(
    "worktreePathTemplate",
    DEFAULT_WORKTREE_PATH_TEMPLATE,
  );
}

export function sortDirtyFirst(): boolean {
  return settings().get<boolean>("sortDirtyFirst", false);
}

export function colorMode(): ColorMode {
  return settings().get<string>("colorMode", "branch") === "branchType"
    ? "branchType"
    : "branch";
}

/**
 * The user's branch-prefix → type map merged over the built-in defaults, so a
 * partial override adds or replaces entries without discarding the rest. Keys
 * are lower-cased and unknown type values are dropped.
 */
export function branchTypeMap(): Record<string, BranchType> {
  const overrides = settings().get<Record<string, string>>(
    "branchTypeMap",
    {},
  );
  const merged: Record<string, BranchType> = { ...DEFAULT_BRANCH_TYPE_MAP };
  for (const [prefix, type] of Object.entries(overrides ?? {})) {
    if ((BRANCH_TYPES as readonly string[]).includes(type)) {
      merged[prefix.toLowerCase()] = type as BranchType;
    }
  }
  return merged;
}
