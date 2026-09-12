/** Centralized identity so publisher/extension ID only needs to change here before publishing. */
export const EXTENSION_ID = "git-secret-guard.git-secret-guard";
export const CONFIG_SECTION = "gitSecretGuard";
export const OUTPUT_CHANNEL_NAME = "Git Secret Guard";
export const BINARY_NAME = process.platform === "win32" ? "gitleaks.exe" : "gitleaks";

/** Written into every hook script we install so uninstall/upgrade only ever touches our own hooks. */
export const HOOK_MARKER = "git-secret-guard:managed";

/** Local, non-transmitted marker file a post-commit hook writes when a --no-verify commit would have been flagged. */
export const ALERT_FILE_NAME = "git-secret-guard-alert.json";
