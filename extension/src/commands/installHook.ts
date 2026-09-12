import * as vscode from "vscode";
import { findGitRoot } from "../git/gitRoot";
import { installHooks, uninstallHooks } from "../git/hookInstaller";
import { buildEffectiveConfig } from "../scanEngine/effectiveConfig";
import { BinaryResolver } from "../scanEngine/binaryResolver";
import { readConfig } from "../configuration";
import { Logger } from "../logger";

export function registerInstallHookCommand(context: vscode.ExtensionContext, logger: Logger): vscode.Disposable {
  return vscode.commands.registerCommand("gitSecretGuard.installHook", async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      vscode.window.showWarningMessage("Git Secret Guard: open a folder or workspace first.");
      return;
    }
    const gitRoot = findGitRoot(folder.uri.fsPath);
    if (!gitRoot) {
      vscode.window.showWarningMessage("Git Secret Guard: this folder is not inside a git repository.");
      return;
    }

    const confirm = await vscode.window.showInformationMessage(
      "Install a pre-commit hook that scans staged changes for secrets before every commit, and a post-commit hook " +
        "that double-checks after (so a `--no-verify` bypass still gets flagged)? Both are removable at any time via " +
        '"Git Secret Guard: Uninstall Pre-Commit Hook".',
      { modal: true },
      "Install",
    );
    if (confirm !== "Install") {
      return;
    }

    const cfg = readConfig(folder.uri);
    const binaryPath = new BinaryResolver(context.extensionPath, cfg.gitleaksPath).resolve();
    const effectiveConfig = buildEffectiveConfig({
      extensionPath: context.extensionPath,
      customRulesPath: cfg.customRulesPath,
      allowlistPath: cfg.allowlistPath,
    });

    const result = installHooks(gitRoot, {
      binaryPath,
      blockCommitOnSecret: cfg.blockCommitOnSecret,
      effectiveConfig,
    });

    logger.info(`Installed hooks into ${result.hooksDir}`);
    if (result.backedUpForeignHooks.length > 0) {
      logger.info(`Backed up existing (non-managed) hook(s): ${result.backedUpForeignHooks.join(", ")}`);
      vscode.window.showInformationMessage(
        `Git Secret Guard: hooks installed. Existing hook(s) were backed up rather than overwritten: ${result.backedUpForeignHooks
          .map((p) => p.split("/").pop())
          .join(", ")}`,
      );
    } else {
      vscode.window.showInformationMessage("Git Secret Guard: pre-commit and post-commit hooks installed.");
    }
  });
}

export function registerUninstallHookCommand(logger: Logger): vscode.Disposable {
  return vscode.commands.registerCommand("gitSecretGuard.uninstallHook", async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      vscode.window.showWarningMessage("Git Secret Guard: open a folder or workspace first.");
      return;
    }
    const gitRoot = findGitRoot(folder.uri.fsPath);
    if (!gitRoot) {
      vscode.window.showWarningMessage("Git Secret Guard: this folder is not inside a git repository.");
      return;
    }

    const result = uninstallHooks(gitRoot);
    if (result.removedHooks.length === 0) {
      vscode.window.showInformationMessage("Git Secret Guard: no managed hooks were installed.");
      return;
    }

    logger.info(`Removed hooks: ${result.removedHooks.join(", ")}`);
    if (result.restoredBackups.length > 0) {
      logger.info(`Restored previous hook(s) that were backed up at install time: ${result.restoredBackups.join(", ")}`);
    }
    vscode.window.showInformationMessage("Git Secret Guard: hooks uninstalled.");
  });
}
