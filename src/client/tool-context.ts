/**
 * Module-level command path context for the CLI.
 *
 * The CLI runs one command per process, so a simple module-level variable is
 * sufficient (no AsyncLocalStorage needed).
 *
 * Usage:
 *   1. Call setCurrentCommandPath("cli products list") in the commander
 *      preAction hook (src/index.ts) before the action fires.
 *   2. http.ts reads currentToolName() to populate the X-Haszno-Tool header.
 */

/** Pattern from the API contract: /^[a-zA-Z0-9_.:\- ]{1,80}$/ */
const TOOL_HEADER_RE = /^[a-zA-Z0-9_.:\- ]{1,80}$/

let _currentCommandPath: string | undefined

/**
 * Sets the current CLI command path (e.g. "cli products list").
 * Called once per process from the commander preAction hook.
 */
export function setCurrentCommandPath(path: string): void {
  _currentCommandPath = path
}

/**
 * Returns the stored command path if it matches the X-Haszno-Tool header
 * contract, or undefined when not set or invalid.
 */
export function currentToolName(): string | undefined {
  if (_currentCommandPath !== undefined && TOOL_HEADER_RE.test(_currentCommandPath)) {
    return _currentCommandPath
  }
  return undefined
}
