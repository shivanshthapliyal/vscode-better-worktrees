import { showError } from "./notifications";

/**
 * Wraps a command handler so a rejected promise surfaces as an error
 * notification instead of an unhandled rejection the user never sees.
 */
export function runCommand<T extends unknown[]>(
  command: (...args: T) => Thenable<void> | Promise<void>,
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await command(...args);
    } catch (error) {
      showError("Worktrees: Command failed", error);
    }
  };
}
