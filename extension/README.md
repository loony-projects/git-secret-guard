# Git Secret Guard

Blocks secrets and credentials from reaching git history, and manages
`.gitignore` safely — every change explicit, diffable, and user-approved,
never a silent rewrite.

## What it does

1. **Secret detection**, wrapping [`gitleaks`](https://github.com/gitleaks/gitleaks):
   - On save: lightweight, non-blocking editor diagnostics.
   - On commit: a pre-commit hook scans staged changes (`gitleaks protect
     --staged`) and blocks or warns, per `gitSecretGuard.blockCommitOnSecret`.
   - After commit: a post-commit hook re-checks the commit that was just
     made — this is what still flags a `git commit --no-verify` bypass,
     without inventing a competing bypass mechanism.
   - On demand: **Git Secret Guard: Scan Workspace** for a full sweep,
     including git history when run inside a repo.
2. **A `.gitignore` Advisor** that detects what kind of project this is
   (Node, React, React Native, Android, iOS, Rust, Python, Go, Java, PHP,
   Ruby, .NET, and more — manifests, on-disk build artifacts, monorepo
   subtrees) and proposes the right ignore rules — plus flags secret-shaped
   files that aren't ignored yet — always as an explicit diff you approve
   before anything is written.

## Commands

| Command | What it does |
|---|---|
| **Git Secret Guard: Scan Workspace** | Full sweep of the current folder — full git history when it's a repo, a plain directory scan otherwise. |
| **Git Secret Guard: Regenerate .gitignore Suggestions** | Re-runs the Advisor and opens a diff of proposed changes; nothing is written until you click Apply. |
| **Git Secret Guard: Install Pre-Commit Hook** | Asks for confirmation, then installs a pre-commit + post-commit hook pair (`core.hooksPath`-aware; backs up any existing hook rather than overwriting it). |
| **Git Secret Guard: Uninstall Pre-Commit Hook** | Removes the managed hooks and restores whatever was backed up at install time. |
| **Git Secret Guard: Show Output** | Opens the "Git Secret Guard" output channel. |

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `gitSecretGuard.blockCommitOnSecret` | `true` | Hard-block a commit on a high-confidence finding, vs. warn-only. |
| `gitSecretGuard.scanOnSave` | `true` | Editor diagnostics on save. |
| `gitSecretGuard.customRulesPath` | `""` | Extra gitleaks-format TOML rules, merged with the bundled default ruleset. |
| `gitSecretGuard.allowlistPath` | `""` | A user-maintained TOML allowlist — the only supported way to suppress a false positive. |
| `gitSecretGuard.gitleaksPath` | `""` | Override the gitleaks binary location. |
| `gitSecretGuard.autoDetectProjectType` | `true` | Toggles the `.gitignore` Advisor's project-type detection (the secret-file detector stays on regardless). |
| `gitSecretGuard.notifyOnNewManifest` | `true` | Dismissible notification when a new manifest appears mid-session. |

Full ruleset breakdown and fragment-file format: see the project's
`docs/configuration.md` on GitHub.

## Requirements

This extension wraps the [`gitleaks`](https://github.com/gitleaks/gitleaks)
CLI rather than reimplementing secret detection. If a bundled binary isn't
packaged for your platform, install it yourself and either put it on
`PATH` or point `gitSecretGuard.gitleaksPath` at it:

```bash
brew install gitleaks
# or: go install github.com/gitleaks/gitleaks/v8@latest
```

## Non-negotiable safety invariants

- **Never transmits file contents anywhere.** No telemetry of scanned
  content, ever — not even aggregated or hashed.
- **Never modifies `.gitignore` without an explicit, previewable,
  user-approved diff.** No auto-write on activation, no silent merge.
- **Never installs a git hook without asking first**, and always provides an
  equally easy uninstall path.
- **Never deletes, rewrites, or force-pushes anything.** This extension only
  blocks or warns; it never touches git history itself.
- **A detected secret is never logged, echoed into the output channel, or
  included verbatim in a notification** — only its location (file, line,
  rule name) and a redacted first/last-2-character preview.
- **False positives are suppressible only via an explicit allowlist file**
  you edit and approve — never an automatic "seen before, ignore forever"
  heuristic that could hide a real leak.

## What this does *not* catch

This is a safety net, not a guarantee:

- **It can't unsee a secret already pushed to a public (or any) remote.**
  If `git commit --no-verify` or a stale clone gets a real credential into
  history and it's pushed, this extension's post-commit alert tells you —
  but the fix from there is **rotate the credential immediately**, not just
  scrub history. Anyone who fetched before you scrub still has it, and
  public remotes get scraped fast.
- **It doesn't verify secrets are live.** gitleaks matches *shape*, not
  validity — a format-correct fixture, an expired key, and a live
  production key all look the same to it. Treat every finding as
  "investigate," not "definitely real" or "definitely safe to ignore."
- **It only catches what its ruleset recognizes.** The bundled rules are
  deliberately conservative to avoid false-positive fatigue; an internal
  token format your team invented won't be caught until you add it via
  `gitSecretGuard.customRulesPath`.
- **Generic high-entropy detection is off by default** — a secret with no
  recognizable prefix or key name won't be flagged unless you opt in.
- **`git commit --no-verify` genuinely bypasses the pre-commit block** —
  that's git's own escape hatch, not a bug here. The post-commit hook flags
  it after the fact; it can't prevent it.
- **It doesn't scan history it's never asked to scan.** The pre-commit hook
  only looks at staged changes, and on-save diagnostics only look at the
  open file. Run **Git Secret Guard: Scan Workspace** (which does walk full
  git history) when onboarding an existing repo.

## Learn more

Full architecture, the gitleaks-vs-alternatives decision writeup, and the
complete configuration reference live in the repository:
[github.com/git-secret-guard/git-secret-guard](https://github.com/git-secret-guard/git-secret-guard).

## License

MIT
