import * as vscode from "vscode";
import { registerClipboardCommands } from "./clipboard";
import { CommandContext } from "./context";
import { registerCreateCommands } from "./create";
import { registerLifecycleCommands } from "./lifecycle";
import { registerOpenCommands } from "./open";
import { registerSourceControlCommands } from "./sourceControl";
import { registerWorkspaceCommands } from "./workspace";

export { CommandContext } from "./context";

/**
 * Registers every command the extension contributes. The returned disposables
 * are owned by the caller, which keeps activation the only place that decides
 * what the extension's lifetime is.
 */
export function registerCommands(ctx: CommandContext): vscode.Disposable[] {
  return [
    ...registerCreateCommands(ctx),
    ...registerOpenCommands(ctx),
    ...registerClipboardCommands(),
    ...registerWorkspaceCommands(),
    ...registerSourceControlCommands(ctx),
    ...registerLifecycleCommands(ctx),
  ];
}
