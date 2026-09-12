import { ALERT_FILE_NAME, HOOK_MARKER } from "../constants";

export interface HookScriptOptions {
  binaryPath: string;
  configPath: string;
  blockCommitOnSecret: boolean;
}

/**
 * Pre-commit: `gitleaks protect --staged` is gitleaks' own purpose-built
 * command for exactly this (scan only what's staged, not the working tree).
 * `--redact` is used here deliberately — this hook prints straight to the
 * developer's terminal, a place we don't control and can't apply our own
 * first/last-2-char redaction to, so we lean on gitleaks' native redaction
 * for that output path instead of reinventing it.
 */
export function buildPreCommitScript(options: HookScriptOptions): string {
  const block = options.blockCommitOnSecret ? "1" : "0";
  return `#!/bin/sh
# ${HOOK_MARKER}
# Installed by the Git Secret Guard VS Code extension.
# Uninstall via "Git Secret Guard: Uninstall Pre-Commit Hook", or delete
# this file (and any git-secret-guard-managed post-commit hook).
#
# Scans only staged changes (git diff --cached, via gitleaks' own
# "protect --staged"), never the whole working tree or git history.

GITLEAKS_BIN="${options.binaryPath}"
CONFIG_PATH="${options.configPath}"
BLOCK_ON_SECRET=${block}

if ! command -v "$GITLEAKS_BIN" >/dev/null 2>&1 && [ ! -x "$GITLEAKS_BIN" ]; then
  echo "git-secret-guard: gitleaks binary not found at '$GITLEAKS_BIN' and not on PATH; skipping secret scan." >&2
  exit 0
fi

"$GITLEAKS_BIN" protect --staged --config "$CONFIG_PATH" --redact --no-banner
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
  echo "" >&2
  echo "git-secret-guard: potential secret(s) detected in staged changes (see above)." >&2
  echo "git-secret-guard: fix the finding, or run 'git commit --no-verify' to bypass (Git Secret Guard will still flag it afterward)." >&2
  if [ "$BLOCK_ON_SECRET" -eq 1 ]; then
    exit 1
  fi
  echo "git-secret-guard: gitSecretGuard.blockCommitOnSecret is false — allowing the commit to proceed." >&2
fi

exit 0
`;
}

/**
 * Post-commit ALWAYS runs, even after `git commit --no-verify` (which only
 * skips pre-commit/commit-msg) — this is what lets us surface a warning for
 * a bypassed commit without inventing a competing bypass mechanism. It can
 * never block anything; the commit has already happened. `--redact` is used
 * here too, and deliberately: this is the one place a finding is written to
 * a *file* rather than shown transiently, so raw secret content must never
 * land in it, even briefly.
 */
export function buildPostCommitScript(options: HookScriptOptions): string {
  return `#!/bin/sh
# ${HOOK_MARKER}
# Installed by the Git Secret Guard VS Code extension.
# Always runs (unlike pre-commit, NOT skipped by --no-verify), so it
# re-checks the commit that was just made and leaves a local, redacted
# alert marker if something would have been flagged. Never blocks anything
# — the commit has already happened; this is a "you should know" safety net.

GITLEAKS_BIN="${options.binaryPath}"
CONFIG_PATH="${options.configPath}"

GIT_DIR=$(git rev-parse --git-dir 2>/dev/null) || exit 0
ALERT_PATH="$GIT_DIR/${ALERT_FILE_NAME}"
rm -f "$ALERT_PATH"

if ! command -v "$GITLEAKS_BIN" >/dev/null 2>&1 && [ ! -x "$GITLEAKS_BIN" ]; then
  exit 0
fi

"$GITLEAKS_BIN" detect --log-opts=-1 --config "$CONFIG_PATH" --redact --report-format json --report-path "$ALERT_PATH" --no-banner --exit-code 1 >/dev/null 2>&1
STATUS=$?

if [ "$STATUS" -eq 0 ] || [ ! -s "$ALERT_PATH" ]; then
  rm -f "$ALERT_PATH"
fi

exit 0
`;
}
