import * as fs from "fs";
import * as path from "path";
import { HOOK_MARKER } from "../constants";
import { resolveHooksDir } from "./hooksPath";
import { buildPostCommitScript, buildPreCommitScript, HookScriptOptions } from "./hookScripts";

const EFFECTIVE_CONFIG_FILE_NAME = "git-secret-guard-effective-config.toml";
const MANAGED_HOOK_NAMES = ["pre-commit", "post-commit"] as const;

export interface InstallResult {
  hooksDir: string;
  effectiveConfigPath: string;
  backedUpForeignHooks: string[];
}

export interface InstallOptions {
  binaryPath: string;
  blockCommitOnSecret: boolean;
  effectiveConfig: string;
}

function isManagedByUs(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return true;
  }
  const content = fs.readFileSync(filePath, "utf8");
  return content.includes(HOOK_MARKER);
}

function backUpForeignHook(filePath: string): string {
  const backupPath = `${filePath}.bak-${Date.now()}`;
  fs.renameSync(filePath, backupPath);
  return backupPath;
}

/**
 * Installs (or idempotently re-installs / upgrades) the pre-commit and
 * post-commit hooks into the repo's effective hooks directory. Never
 * touches a hook it didn't create without first backing it up — an
 * existing foreign hook is renamed aside (`<name>.bak-<timestamp>`), never
 * deleted or silently overwritten.
 */
export function installHooks(repoRoot: string, options: InstallOptions): InstallResult {
  const hooksDir = resolveHooksDir(repoRoot);
  fs.mkdirSync(hooksDir, { recursive: true });

  const backedUpForeignHooks: string[] = [];
  for (const name of MANAGED_HOOK_NAMES) {
    const hookPath = path.join(hooksDir, name);
    if (fs.existsSync(hookPath) && !isManagedByUs(hookPath)) {
      backedUpForeignHooks.push(backUpForeignHook(hookPath));
    }
  }

  const effectiveConfigPath = path.join(hooksDir, EFFECTIVE_CONFIG_FILE_NAME);
  writeEffectiveConfig(effectiveConfigPath, options.effectiveConfig);

  const scriptOptions: HookScriptOptions = {
    binaryPath: options.binaryPath,
    configPath: effectiveConfigPath,
    blockCommitOnSecret: options.blockCommitOnSecret,
  };

  writeHook(path.join(hooksDir, "pre-commit"), buildPreCommitScript(scriptOptions));
  writeHook(path.join(hooksDir, "post-commit"), buildPostCommitScript(scriptOptions));

  return { hooksDir, effectiveConfigPath, backedUpForeignHooks };
}

/** Rewrites just the effective config snapshot (e.g. after a settings change), leaving hook scripts untouched. */
export function refreshEffectiveConfig(repoRoot: string, effectiveConfig: string): string {
  const hooksDir = resolveHooksDir(repoRoot);
  const effectiveConfigPath = path.join(hooksDir, EFFECTIVE_CONFIG_FILE_NAME);
  writeEffectiveConfig(effectiveConfigPath, effectiveConfig);
  return effectiveConfigPath;
}

export interface UninstallResult {
  removedHooks: string[];
  restoredBackups: string[];
}

/** Removes only hooks bearing our marker, and restores the most recent backup for each, if one exists. */
export function uninstallHooks(repoRoot: string): UninstallResult {
  const hooksDir = resolveHooksDir(repoRoot);
  const removedHooks: string[] = [];
  const restoredBackups: string[] = [];

  for (const name of MANAGED_HOOK_NAMES) {
    const hookPath = path.join(hooksDir, name);
    if (fs.existsSync(hookPath) && isManagedByUsStrict(hookPath)) {
      fs.unlinkSync(hookPath);
      removedHooks.push(hookPath);

      const backup = findMostRecentBackup(hooksDir, name);
      if (backup) {
        fs.renameSync(backup, hookPath);
        restoredBackups.push(hookPath);
      }
    }
  }

  const effectiveConfigPath = path.join(hooksDir, EFFECTIVE_CONFIG_FILE_NAME);
  if (fs.existsSync(effectiveConfigPath)) {
    fs.unlinkSync(effectiveConfigPath);
  }

  return { removedHooks, restoredBackups };
}

function isManagedByUsStrict(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  return fs.readFileSync(filePath, "utf8").includes(HOOK_MARKER);
}

function findMostRecentBackup(hooksDir: string, hookName: string): string | undefined {
  const prefix = `${hookName}.bak-`;
  const candidates = fs
    .readdirSync(hooksDir)
    .filter((f) => f.startsWith(prefix))
    .sort()
    .reverse();
  return candidates.length > 0 ? path.join(hooksDir, candidates[0]) : undefined;
}

function writeHook(hookPath: string, content: string): void {
  fs.writeFileSync(hookPath, content, { mode: 0o755 });
  fs.chmodSync(hookPath, 0o755);
}

function writeEffectiveConfig(configPath: string, content: string): void {
  fs.writeFileSync(configPath, content, { mode: 0o600 });
}

export function isHooksInstalled(repoRoot: string): boolean {
  const hooksDir = resolveHooksDir(repoRoot);
  return MANAGED_HOOK_NAMES.every((name) => isManagedByUsStrict(path.join(hooksDir, name)));
}
