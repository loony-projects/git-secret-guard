# Why gitleaks, and what this extension adds on top of it

## The decision

Git Secret Guard wraps [`gitleaks`](https://github.com/gitleaks/gitleaks) as
its secret-detection engine. It does not reimplement pattern matching or
entropy analysis in TypeScript, for the same reason the sibling
`rust-prettier` project wraps `rustfmt` instead of writing a Rust formatter
in TypeScript: the hard part (a maintained, battle-tested ruleset and a fast
matching engine) already exists, is actively maintained by people who track
new credential formats as providers ship them, and re-deriving it badly would
make this extension *less* trustworthy, not more.

### Options considered

| Tool | Verdict | Why |
|---|---|---|
| **gitleaks** | **Chosen** | Single static Go binary, no network calls by default, TOML rules + a native allowlist model, git-aware (`detect`, `protect --staged`), JSON output with a stable schema, permissive license (MIT). |
| [trufflehog](https://github.com/trufflesecurity/trufflehog) | Not used | Its headline feature — verifying secrets are *live* against the issuing API — is exactly what conflicts with this extension's "never transmit file contents anywhere" invariant. Even opt-in, that's a network dependency this project deliberately avoids in its default and recommended path. |
| [detect-secrets](https://github.com/Yelp/detect-secrets) | Not used | Python runtime dependency with no single-binary distribution story as clean as gitleaks' — bundling a Python interpreter and its plugin ecosystem into a VS Code extension is a much larger surface than shipping one static binary per platform. Its baseline-file workflow (`.secrets.baseline`) is a good idea, though — this extension's allowlist file plays a similar role. |
| GitHub push protection patterns | Reference only | Not something invocable locally; useful as a taxonomy cross-check when writing `resources/gitleaks/default.toml`, not as an engine. |

## What gitleaks actually gives us

The extension shells out to specific, real gitleaks subcommands, chosen for
what each is purpose-built for rather than reused generically:

| Use case | Command | Why this one |
|---|---|---|
| Pre-commit hook | `gitleaks protect --staged` | Scans exactly `git diff --cached` — gitleaks' own staged-diff mode, not a hand-rolled diff scan. |
| "Scan Workspace" (inside a repo) | `gitleaks detect` | Full git-history scan — gitleaks' actual strength (per the product spec, "git-aware, scans diffs/history"), useful for onboarding an existing repo that might already have a leaked secret sitting in an old commit. |
| "Scan Workspace" (no repo) | `gitleaks detect --no-git --source <dir>` | Plain directory scan when there's no git history to walk. |
| Post-commit safety net | `gitleaks detect --log-opts=-1` | Scoped to just `HEAD`, so re-checking the commit that was just made stays fast regardless of repo history size. |
| On-save diagnostics | `gitleaks stdin` | Reads the buffer directly over stdin — the file's content is never written to disk by this extension, including an unsaved buffer. |

## What the extension adds on top

Wrapping gitleaks is necessary but not sufficient for the product this spec
describes. The VS Code layer adds:

- **Editor-integrated diagnostics** (squiggles on save) — gitleaks has no
  concept of an open editor buffer; `stdin` mode plus VS Code's
  `DiagnosticCollection` API is what turns a CLI exit code into an in-editor
  warning.
- **Hook lifecycle management** — installing, upgrading, and cleanly
  uninstalling `pre-commit`/`post-commit` hooks, `core.hooksPath`-aware,
  never clobbering a hook it didn't create (see `docs/architecture.md`).
- **The `--no-verify` safety net** — gitleaks has no opinion on bypassed
  commits; the post-commit hook plus a `FileSystemWatcher`-driven alert is
  entirely this extension's design (see `docs/architecture.md`).
- **Our own redaction layer** — gitleaks' `--redact` flag fully masks a
  match. This extension instead captures the raw match transiently
  in-process, computes a first/last-2-character preview, and immediately
  discards the raw value — because the product spec calls for a partial
  preview, not full redaction, in the VS Code UI. The `--redact` flag *is*
  used for the two places where a raw value would otherwise land somewhere
  we don't fully control: the pre-commit hook's terminal output, and the
  post-commit alert file (see `docs/architecture.md` for both).
- **Config merging** — gitleaks reads one config file; this extension merges
  the bundled default ruleset, an optional custom-rules file, and an
  allowlist file into one effective config before every invocation (see
  `src/scanEngine/configMerge.ts`).
- **The `.gitignore` Advisor** — entirely out of scope for gitleaks, which
  only ever looks at content, never proposes ignore rules.

## The ruleset: curated, not vendored

`extension/resources/gitleaks/default.toml` is authored for this project,
not a copy of upstream gitleaks' own `gitleaks.toml`. Two reasons:

1. **Conservatism.** The product spec is explicit that noisy generic
   high-entropy checks are the #1 source of extension fatigue. Upstream's
   default ruleset includes broader heuristics than this extension wants on
   by default. Curating our own list lets every rule be either a
   recognizable secret *format* (a provider's key prefix, a PEM header) or a
   secret-sounding *assignment* (`API_KEY=...`), which keeps the
   false-positive rate low without needing gitleaks' entropy scoring at all
   for the default path.
2. **No live fetch during a security-sensitive build.** Vendoring upstream's
   file wholesale would mean either fetching it at build time from a
   third-party repo (a supply-chain dependency this project would rather not
   take on silently) or manually re-copying it periodically. Hand-authoring
   a smaller, reviewed set means every rule in the file was actually read by
   a maintainer.

See `docs/configuration.md` for the full list of bundled rules, which are
default-on vs. opt-in, and how to extend the ruleset.

## Binary distribution

Gitleaks is a single static Go binary — the same
binary-distribution shape as `rustfmt` in the sibling project, and
`src/scanEngine/binaryResolver.ts` mirrors that project's `BinaryResolver`
almost exactly: check `gitSecretGuard.gitleaksPath` → a bundled
`bin/<platform>-<arch>/gitleaks[.exe]` → `gitleaks` on `PATH`.

Unlike `rustfmt`, this project doesn't compile the binary itself — it has to
download an upstream release. That happens in CI, not in this repository:
`scripts/fetch-gitleaks.sh` downloads a pinned gitleaks version from its
GitHub releases and verifies the published SHA-256 checksum before placing
the binary under `extension/bin/`. Nothing in `extension/bin/` is committed
to version control (see `extension/bin/README.md`); a `.vsix` built by CI
bundles the binaries this script produces per target platform. Until you
build one yourself, install gitleaks locally (`brew install gitleaks`, a
release binary on `PATH`, etc.) — the resolver falls back to `PATH`
automatically.

## What this does *not* cover

- **Pre-push scanning.** Investigated and deliberately left out of v1: a
  pre-push hook would need to scan the full commit range about to be
  pushed, which — without careful `--log-opts` scoping tuned to the
  specific remote/branch situation — risks being slow enough on a large,
  long-lived repo that developers start reaching for `--no-verify` as a
  habit rather than an exception. The on-demand `gitleaks detect` full
  history scan (the "Scan Workspace" command) already answers "has anything
  ever leaked in this repo," which covers the same underlying risk without
  adding push-time latency. This may be revisited once there's a scoping
  heuristic that's fast on a real large repo, not just a small fixture one.
- **Verification.** gitleaks only checks *shape*, not whether a matched key
  is actually live. That's an explicit trade-off for staying offline (see
  the trufflehog row above) — see the README's "what this doesn't catch"
  section for what that means for you if a real credential does leak.
