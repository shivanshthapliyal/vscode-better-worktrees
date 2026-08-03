import * as vscode from "vscode";
import { showNotifications } from "./config";
import { log } from "./logger";

type NotificationLevel = "info" | "warning" | "error";

export function showInfo(message: string): void {
  notify("info", message);
}

export function showWarning(message: string): void {
  notify("warning", message);
}

export function showError(message: string, error?: unknown): void {
  const detail = error instanceof Error ? error.message : String(error ?? "");
  notify("error", detail ? `${message}: ${detail}` : message);
}

/**
 * Everything is logged to the output channel regardless of the notification
 * setting, so silencing toasts never costs the user the ability to diagnose.
 * Only successes are silenced; warnings and errors always surface.
 */
function notify(level: NotificationLevel, message: string): void {
  log(message);

  if (level === "info" && !showNotifications()) {
    return;
  }

  switch (level) {
    case "info":
      void vscode.window.showInformationMessage(message);
      return;
    case "warning":
      void vscode.window.showWarningMessage(message);
      return;
    case "error":
      void vscode.window.showErrorMessage(message);
      return;
  }
}
