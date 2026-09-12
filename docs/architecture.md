# Architecture

## Layers

```
VS Code Extension (TypeScript, extension/src/)
        |
        +-- extension.ts                     activation, wiring, disposables
        |
        +-- Diagnostics provider              on-save squiggles (diagnostics/)
        +-- Commands                          scanWorkspace, regenerateGitignore,
        |                                     installHook, uninstallHook, showOutput
        +-- alertWatcher.ts                   --no-verify safety-net notifications
        +-- manifestWatcher.ts                "new project type detected" notifications
        |
        +-- .gitignore Advisor (gitignoreAdvisor/)
        |     projectDetector -> templates -> merge -> advisor -> diffPreviewProvider
        |
        v
Secret-Scan Engine (scanEngine/)
        binaryResolver -> effectiveConfig (configMerge) -> gitleaksClient -> processRunner
        |
        +-- resources/gitleaks/default.toml    bundled ruleset
        +-- (user) customRulesPath / allowlistPath
        |
        v
Git integration layer (git/)
        gitRoot -> hooksPath -> hookScripts -> hookInstaller
```

Each layer is a separate, independently testable module, deliberately
mirroring the `extension/` vs. `formatter/` separation in the sibling
`rust-prettier` project:

- **scanEngine/** has no dependency on `vscode` at all except through the
  values its callers pass in (`binaryResolver.ts` takes an extension path
  and a configured override string, not a `vscode.ExtensionContext`). This
  is what makes `gitleaksClient.test.ts` and `configMerge.test.ts` runnable
  as plain Node/mocha tests with an injected fake process runner, with no
  real `gitleaks` binary and no VS Code test harness needed.
- **git/** is pure Node (`child_process`, `fs`) — `hookInstaller.test.ts`
  runs against a real temporary `git init` repository, so its round-trip
  behavior is genuinely verified rather than mocked.
- **gitignoreAdvisor/** (`projectDetector.ts`, `merge.ts`,
  `secretFileDetector.ts`, `advisor.ts`) is pure Node/fs/git-CLI logic;
  only `diffPreviewProvider.ts` and the command wrappers touch `vscode`.
- Only `extension.ts`, `diagnostics/`, and the `commands/` wrappers actually
  import `vscode` for UI (notifications, diagnostics, the diff view).

## Data flow: from a keystroke to a diagnostic

1. User saves a file. `extension.ts`'s `onDidSaveTextDocument` handler checks
   `gitSecretGuard.scanOnSave`.
2. `DiagnosticsProvider.scanDocument` calls
   `GitleaksClient.scanStdin(document.getText())` — the buffer is piped to
   `gitleaks stdin` over the child process's stdin; it is never written to a
   file by this extension.
3. `GitleaksClient` writes the *effective config* (see below) to a `0600`
   temp file, tells gitleaks to write its JSON report to a second `0600`
   temp file, runs the process, reads the report back into memory, and
   deletes both temp files in a `finally` — regardless of outcome.
4. Each `RawFinding` is turned into a `vscode.Diagnostic` via
   `redactFinding`/`formatFindingMessage` (`redact.ts`) — the *only* path
   allowed to format a finding for display. The raw secret value never
   reaches a `Diagnostic`, a notification, or `Logger`.

## The effective config

Three sources — the bundled `resources/gitleaks/default.toml`, an optional
`gitSecretGuard.customRulesPath` file, and an optional
`gitSecretGuard.allowlistPath` file — are merged into one TOML text
(`scanEngine/configMerge.ts`) before every gitleaks invocation:

- The **header** (title, etc.) is taken only from the default file, so the
  merged file never has a duplicate top-level key.
- **`[[rules]]` blocks** are concatenated in order (default, then custom) —
  gitleaks uses the last-defined rule for a given `id`, so a custom rule can
  intentionally shadow a default one.
- The **`[allowlist]` table** is special-cased: TOML has no way to merge two
  `[allowlist]` tables, so `configMerge.ts` extracts the `paths`/`regexes`/
  `stopwords` arrays from every source that defines one and emits a single
  combined table.

This is why `customRulesPath`/`allowlistPath` files are documented as
*fragment* files (only `[[rules]]`/`[allowlist]` content, no other top-level
keys) — see `docs/configuration.md`.

For the two hook scripts (which run outside the extension process, from a
plain shell), the same effective config is written once, at install time
(and on relevant settings changes), to `<hooksDir>/git-secret-guard-effective-config.toml`
— see below.

## Git hooks

### Why pre-commit *and* post-commit

`git commit --no-verify` skips `pre-commit` and `commit-msg` hooks — that's
git's own standard escape hatch, and this extension does not invent a
competing one. It does **not** skip `post-commit`. So:

- **`pre-commit`** runs `gitleaks protect --staged --redact`. If it exits
  non-zero, the script prints gitleaks' own (redacted) report to the
  terminal and exits non-zero itself only when `gitSecretGuard.blockCommitOnSecret`
  is true (baked into the script at install time as `BLOCK_ON_SECRET=0|1`);
  otherwise it warns and lets the commit through.
- **`post-commit`** always runs. It re-scans just the commit that was made
  (`gitleaks detect --log-opts=-1 --redact`) and, if that commit contains a
  finding, writes a small `--redact`-ed JSON report to
  `$(git rev-parse --git-dir)/git-secret-guard-alert.json`. It can never
  block anything — the commit already happened — this is a "you should
  know" safety net, covering both a `--no-verify` bypass and a
  warn-only-allowed-through commit.

`alertWatcher.ts` watches that exact file path with a
`vscode.FileSystemWatcher`, and also checks for it once eagerly on
activation (covering a commit made while VS Code wasn't running). On
finding content, it shows a warning notification with file/line/rule (all
already `--redact`-ed by gitleaks, so nothing raw ever reaches this code
path) and deletes the file immediately, whether or not a notification was
shown.

### Why `--redact` here specifically, unlike everywhere else

Everywhere else in this extension, redaction is *our* job (see
`redact.ts`), because the product spec wants a first/last-2-character
preview, which needs the raw value transiently in-process. The pre-commit
and post-commit hooks are the two exceptions, and deliberately so:

- The pre-commit hook prints straight to the developer's terminal — a place
  this extension has no way to intercept or post-process. gitleaks' own
  `--redact` is the only redaction available there.
- The post-commit hook writes to a *file* that could in principle sit on
  disk for a while if VS Code isn't running to pick it up. A raw secret
  should never be the thing resting in that file, even briefly, so
  `--redact` is used at the source rather than relying on "the watcher will
  delete it quickly."

### Hook installation mechanics

- **`core.hooksPath`-aware**: `hooksPath.ts` resolves the effective hooks
  directory via `git rev-parse --git-path hooks`, which already accounts
  for `core.hooksPath`, worktrees, and submodules — rather than assuming
  `.git/hooks`.
- **Never clobbers a foreign hook**: every hook this extension writes
  contains a `# git-secret-guard:managed` marker line
  (`constants.ts#HOOK_MARKER`). Installing over an existing `pre-commit` or
  `post-commit` that lacks the marker renames it aside
  (`<hook>.bak-<timestamp>`) instead of overwriting or deleting it.
  Re-installing over a hook that *does* carry the marker is a normal
  upgrade (e.g. after `blockCommitOnSecret` changes).
- **Uninstall restores the backup**: removing a managed hook checks for a
  `.bak-*` file and renames the most recent one back into place, so
  uninstalling this extension's hooks returns a repo to exactly the state
  it was in before installing them.
- **Cross-platform via one POSIX script, not two implementations**: both
  hooks are `#!/bin/sh` scripts. Git for Windows already executes hooks
  through the `sh` it bundles, so a single POSIX script — no `[[ ]]`, no
  `local`, no CRLF — covers Linux, macOS, and Windows without a parallel
  `.cmd`/`.ps1` implementation (verified in `hookScripts.test.ts`).

## The `.gitignore` Advisor

`gitignoreAdvisor/advisor.ts#buildProposal` is a pure function: given a repo
root and the resources directory, it returns the current `.gitignore`
content, the proposed content, and whether they differ — without writing
anything. It combines two independent detectors feeding the same UI:

1. **Project-type detection** (`projectDetector.ts`): walks from the repo
   root (bounded depth, skipping `node_modules`/`target`/etc. so it never
   recurses *into* an artifact directory) looking for manifest files
   per-subtree, plus a handful of artifact-only signals (`node_modules/`
   without `package.json`, etc.) for partially-set-up projects. `target/`
   and `vendor/` are disambiguated using a sibling manifest when one exists
   (Rust vs. Java/Maven; PHP vs. Go) and labeled generically ("Build
   output", "Vendor directory") when neither manifest is present, rather
   than guessing wrong.
2. **Secret-file detection** (`secretFileDetector.ts`): `git ls-files
   --cached --others --exclude-standard` already returns exactly "tracked,
   or untracked-but-not-ignored" — the set the product spec asks for — so
   this detector is a filename-pattern check over that list, with a
   separate `git ls-files --cached` membership check to distinguish
   "already tracked" (needs `git rm --cached` too) from "just needs
   ignoring."

Both feed `merge.ts`, which merges proposed content into the existing
`.gitignore` using delimited, labeled blocks
(`# --- <Label> (auto-detected) ---` … `# --- end <Label> ---`). A block is
replaced in place on re-run (matched by its own start/end markers), never
duplicated — this is what makes applying the same proposal twice a no-op,
and what lets a monorepo have multiple independently-labeled blocks
(`Node.js (frontend/)`, `Rust (backend/)`) without cross-contamination.
Anything outside a recognized block — including a *stale* block for a stack
that's no longer detected — is left untouched; blocks are only ever added or
updated, never removed, since removing something is not what
"auto-detected suggestion" should ever silently do.

The OS block (`.DS_Store`, etc.) is always proposed alongside any detected
stack. The Editor block (`.vscode/`, `.idea/`) is proposed but its lines are
commented out by default — "optional, not default-on," exactly as the
product spec requires, implemented as inert text the user can uncomment
themselves rather than a checkbox.

Nothing here writes to `.gitignore` except `advisor.ts#applyProposal`, which
is only ever called from the command handler after the user clicks "Apply"
on the diff view VS Code opens via `vscode.diff` — see
`commands/regenerateGitignore.ts`.

## Why not a custom TreeView / sidebar

Findings surface through the Problems panel (via `DiagnosticCollection`),
notifications, and the output channel; `.gitignore` suggestions surface
through a diff view. There's no dedicated sidebar or tree view — the
product spec's configuration table is intentionally small, and the same
philosophy applies to UI surface area: five commands and seven settings
don't need a custom view to be usable from the command palette and Source
Control-adjacent notifications.
