import * as vscode from "vscode";
import { GitleaksClient } from "../scanEngine/gitleaksClient";
import { buildEffectiveConfig } from "../scanEngine/effectiveConfig";
import { BinaryResolver } from "../scanEngine/binaryResolver";
import { findGitRoot } from "../git/gitRoot";
import { readConfig } from "../configuration";
import { redactFinding, formatFindingMessage } from "../redact";
import { Logger } from "../logger";

export function registerScanWorkspaceCommand(context: vscode.ExtensionContext, logger: Logger): vscode.Disposable {
  return vscode.commands.registerCommand("gitSecretGuard.scanWorkspace", async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      vscode.window.showWarningMessage("Git Secret Guard: open a folder or workspace first.");
      return;
    }

    const cfg = readConfig(folder.uri);
    const binaryPath = new BinaryResolver(context.extensionPath, cfg.gitleaksPath).resolve();
    const effectiveConfig = buildEffectiveConfig({
      extensionPath: context.extensionPath,
      customRulesPath: cfg.customRulesPath,
      allowlistPath: cfg.allowlistPath,
    });
    const client = new GitleaksClient({ binaryPath, effectiveConfig });

    const targetDir = folder.uri.fsPath;
    const gitRoot = findGitRoot(targetDir);

    logger.info(`Scanning workspace: ${targetDir}${gitRoot ? " (git history scan)" : " (no-git directory scan)"}`);

    try {
      const findings = gitRoot ? await client.scanHistory(gitRoot) : await client.scanDirectoryNoGit(targetDir);

      if (findings.length === 0) {
        vscode.window.showInformationMessage("Git Secret Guard: no secrets found.");
        logger.info("Scan Workspace: no findings.");
        return;
      }

      logger.warn(`Scan Workspace: ${findings.length} finding(s):`);
      for (const finding of findings) {
        const redacted = redactFinding(finding);
        logger.warn(`  ${redacted.file}:${redacted.line} — ${formatFindingMessage(redacted)}`);
      }

      const choice = await vscode.window.showWarningMessage(
        `Git Secret Guard: found ${findings.length} potential secret(s). See the output channel for details (locations and redacted previews only).`,
        "Show Output",
      );
      if (choice === "Show Output") {
        logger.show();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Scan Workspace failed: ${message}`);
      vscode.window.showErrorMessage(`Git Secret Guard: scan failed — ${message}`);
    }
  });
}
