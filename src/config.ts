import * as vscode from "vscode";

/**
 * Every setting this extension reads, in one place. Settings are looked up on
 * each call rather than cached because VS Code lets the user change them at any
 * time and there is no reload between a change and the next command.
 */

const SECTION = "betterWorktrees";
const DEFAULT_SCAN_DEPTH = 3;

export type OpenTarget = "newWindow" | "currentWindow";

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
