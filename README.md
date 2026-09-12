# Git Secret Guard

A VS Code extension that blocks secrets and credentials from reaching git
history, and manages `.gitignore` safely — every change explicit, diffable,
and user-approved, never a silent rewrite.

## What it does

1. **Secret detection**, wrapping [`gitleaks`](https://github.com/gitleaks/gitleaks)
   (see `docs/gitleaks-compatibility.md` for why):
   - On save: lightweight, non-blocking editor diagnostics.
   - On commit: a pre-commit hook scans staged changes (`gitleaks protect
     --staged`) and blocks or warns, per `gitSecretGuard.blockCommitOnSecret`.
   - After commit: a post-commit hook re-checks the commit that was just
     made — this is what still flags a `git commit --no-verify` bypass,
     without inventing a competing bypass mechanism.
   - On demand: **Git Secret Guard: Scan Workspace** for a full sweep,
     including git history when run inside a repo.
2. **A `.gitignore` Advisor** that detects what kind of project this is
   (manifests, on-disk build artifacts, monorepo subtrees) and proposes the
   right ignore rules — plus flags secret-shaped files that aren't ignored
   yet — always as an explicit diff you approve before anything is written.

## Non-negotiable safety invariants

- **Never transmits file contents anywhere.** No telemetry of scanned
  content, ever — not even aggregated or hashed.
- **Never modifies `.gitignore` without an explicit, previewable,
  user-approved diff.** No auto-write on activation, no silent merge.
- **Never installs a git hook without asking first**, and always provides an
  equally easy uninstall path (**Git Secret Guard: Uninstall Pre-Commit
  Hook**).
- **Never deletes, rewrites, or force-pushes anything.** This extension only
  blocks or warns; it never touches git history itself.
- **A detected secret is never logged, echoed into the output channel, or
  included verbatim in a notification** — only its location (file, line,
  rule name) and a redacted first/last-2-character preview.
- **False positives are suppressible only via an explicit allowlist file**
  you edit and approve (`gitSecretGuard.allowlistPath`) — never an automatic
  "seen before, ignore forever" heuristic that could hide a real leak.

## What this does *not* catch

This is a safety net, not a guarantee:

- **It can't unsee a secret already pushed to a public (or any) remote.**
  If `git commit --no-verify` or a stale clone gets a real credential into
  history and it's pushed, this extension's post-commit alert tells you —
  but the fix from there is **rotate the credential immediately**, not just
  scrub history. Anyone who fetched before you scrub still has it, and
  public remotes get scraped fast.
- **It doesn't verify secrets are live.** gitleaks (by design here, see
  `docs/gitleaks-compatibility.md`) matches *shape*, not validity — a
  format-correct fixture, an expired key, and a live production key all
  look the same to it. Treat every finding as "investigate," not
  "definitely real" or "definitely safe to ignore."
- **It only catches what its ruleset recognizes.** The bundled rules
  (`docs/configuration.md`) are deliberately conservative to avoid
  false-positive fatigue; an internal token format your team invented won't
  be caught until you add it via `gitSecretGuard.customRulesPath`.
- **Generic high-entropy detection is off by default** (see
  `docs/configuration.md`) — a secret with no recognizable prefix or key
  name won't be flagged unless you opt in.
- **`git commit --no-verify` genuinely bypasses the pre-commit block** —
  that's git's own escape hatch, not a bug here. The post-commit hook flags
  it after the fact; it can't prevent it.
- **It doesn't scan history it's never asked to scan.** The pre-commit hook
  only looks at staged changes, and on-save diagnostics only look at the
  open file. Run **Git Secret Guard: Scan Workspace** (which does walk full
  git history) when onboarding an existing repo.

## Getting started

```bash
# Install gitleaks (or let the packaged .vsix bundle it — see
# docs/gitleaks-compatibility.md)
brew install gitleaks   # or: go install github.com/gitleaks/gitleaks/v8@latest

cd extension
npm install
npm run compile
```

Then open the `extension/` folder in VS Code and press F5 to launch an
Extension Development Host, or `npm run package` to build a `.vsix`.

Run **Git Secret Guard: Install Pre-Commit Hook** from the command palette
in a repo you want protected — it asks for confirmation before touching
anything in `.git/hooks` (or your configured `core.hooksPath`).

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — module layout, data flow,
  hook lifecycle, the `.gitignore` Advisor's merge algorithm.
- [`docs/gitleaks-compatibility.md`](docs/gitleaks-compatibility.md) — why
  gitleaks, what this extension adds on top, binary distribution.
- [`docs/configuration.md`](docs/configuration.md) — every setting, the
  full bundled ruleset with confidence levels, the custom-rules/allowlist
  fragment file format.
- [`docs/gitignore-templates.md`](docs/gitignore-templates.md) — stacks
  covered, how to add one.

## Testing

```bash
cd extension
npm run compile
npm run lint
npm run unit-test   # plain mocha, no VS Code or real gitleaks binary needed
```

Unit tests cover: the bundled ruleset's regexes against a fixture corpus of
fake-but-shaped secrets per provider (and look-alikes — a UUID, a git commit
hash, a base64 blob — that must *not* trigger); config-merge correctness;
`.gitignore` merge idempotency; project-type detection across Node/React/
React Native/Android/iOS/Rust/Python/monorepo/artifacts-only fixtures; hook
install/uninstall round-trips against a real temporary git repository,
including a `core.hooksPath` repo; and a dedicated test that greps
everything the logger ever received for raw fixture secret values.

The fake secrets themselves live in
[`extension/src/test/unit/fixtures/secretFixtures.ts`](extension/src/test/unit/fixtures/secretFixtures.ts),
built from split string literals rather than stored whole — a realistic
fixture (even an obviously fake one) is exactly what push protection on
GitHub and similar hosts scans for, and would block every push touching
this repo otherwise. See that file's header comment for details.

`npm test` runs the `@vscode/test-electron` integration suite (needs a real
VS Code download, so it's better suited to CI or a dev machine than this
kind of sandboxed environment).

## License

MIT — see [`LICENSE`](LICENSE).
