import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { findGitRoot } from "./git/gitRoot";
import { resolveGitDir } from "./git/hooksPath";
import { ALERT_FILE_NAME } from "./constants";
import { Logger } from "./logger";

interface AlertEntry {
  RuleID: string;
  Description: string;
  File: string;
  StartLine: number;
}

/**
 * Watches for the alert file the post-commit hook writes when a commit —
 * including one made with `git commit --no-verify` — would have been
 * flagged. The file is written with gitleaks' own `--redact` (see
 * hookScripts.ts), so nothing here ever handles a raw secret value; it's
 * deleted immediately after being read, regardless of outcome.
 */
export function watchForNoVerifyAlerts(context: vscode.ExtensionContext, logger: Logger): void {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return;
  }
  const gitRoot = findGitRoot(folder.uri.fsPath);
  if (!gitRoot) {
    return;
  }

  let gitDir: string;
  try {
    gitDir = resolveGitDir(gitRoot);
  } catch {
    return;
  }

  const alertPath = path.join(gitDir, ALERT_FILE_NAME);
  const pattern = new vscode.RelativePattern(path.dirname(alertPath), path.basename(alertPath));
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);

  const handle = () => handleAlertFile(alertPath, logger);
  watcher.onDidCreate(handle);
  watcher.onDidChange(handle);
  context.subscriptions.push(watcher);

  // Catch an alert written while VS Code (or this extension) wasn't running.
  handleAlertFile(alertPath, logger);
}

function handleAlertFile(alertPath: string, logger: Logger): void {
  if (!fs.existsSync(alertPath)) {
    return;
  }
  try {
    const raw = fs.readFileSync(alertPath, "utf8").trim();
    if (raw.length > 0) {
      const entries = JSON.parse(raw) as AlertEntry[];
      if (entries.length > 0) {
        const first = entries[0];
        logger.warn(
          `A commit was made that Git Secret Guard would have flagged (possibly via --no-verify): ` +
            `${first.File}:${first.StartLine} (rule: ${first.RuleID})` +
            (entries.length > 1 ? ` and ${entries.length - 1} more.` : "."),
        );
        void vscode.window
          .showWarningMessage(
            `Git Secret Guard: the last commit may contain a secret (${first.File}:${first.StartLine}, rule: ${first.RuleID}). ` +
              `Rotate the credential if it's real, then remove it from history.`,
            "Show Output",
          )
          .then((choice) => {
            if (choice === "Show Output") {
              logger.show();
            }
          });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Failed to read post-commit alert file: ${message}`);
  } finally {
    try {
      fs.unlinkSync(alertPath);
    } catch {
      // already gone — fine.
    }
  }
}
