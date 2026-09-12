# Build a Git Secret-Leak & .gitignore Safety Extension for VS Code

You are a senior VS Code extension engineer and application-security engineer.

Build a **production-ready VS Code extension that protects developers from accidentally committing or pushing secrets/credentials to GitHub**, and that manages `.gitignore` safely and transparently.

Tentative name: `git-secret-guard`. Publisher: `git-secret-guard`. Display name: `Git Secret Guard`. Centralize the publisher/extension ID in one place so it's trivial to change before publishing (same reasoning as any serious extension: see the sibling `rust-prettier` project's `constants.ts` pattern).

The extension should be designed as a serious open-source project, not a proof of concept.

---

## 1. Product goal

A developer should never be able to `git commit` or `git push` a real credential without a clear, in-editor warning first — and never have their `.gitignore` silently rewritten out from under them.

Two pillars:

1. **Secret detection**: scan files (on save, on stage, on commit, on demand) for things that look like credentials — cloud provider keys (AWS/GCP/Azure), private keys (PEM/SSH), API tokens (GitHub/Stripe/Slack/OpenAI/Anthropic/npm/Twilio/SendGrid/etc.), JWTs, database connection strings with embedded passwords, `.env`-style `KEY=value` secrets, and generic high-entropy strings — and block or warn before they reach git history.
2. **Smart `.gitignore` generation**: automatically *detect what kind of project this is* (by manifest files, and by generated artifacts already sitting on disk) and propose the right ignore rules for it — no manual template picking required — and propose additions for secret-shaped files that aren't ignored yet. **Always as an explicit, diffable, user-approved action**, never a silent rewrite.

## 2. Hard requirement: do not reinvent secret-detection

Just as rustfmt's parser shouldn't be reimplemented in TypeScript, **secret-pattern detection and entropy analysis should not be reinvented from scratch** in this extension. Research and evaluate the mature, actively-maintained ecosystem tools before writing a single regex:

- [`gitleaks`](https://github.com/gitleaks/gitleaks) — Go, single static binary, git-aware (scans diffs/history), large maintained ruleset (TOML), supports custom rules and allowlists, stable CLI with JSON output and exit codes.
- [`trufflehog`](https://github.com/trufflesecurity/trufflehog) — Go, verifies many secret types live against their issuing API (catches *valid* secrets, not just shaped-like-a-secret ones), heavier and network-dependent by default.
- [`detect-secrets`](https://github.com/Yelp/detect-secrets) (Yelp) — Python, plugin-based, baseline-file workflow (`.secrets.baseline`) for suppressing known findings.
- GitHub's own [push protection secret patterns](https://docs.github.com/en/code-security/secret-scanning) — reference for what a "credential" taxonomy looks like, not something you can invoke locally.

**Decision to make and document** (analogous to `docs/rustfmt-compatibility.md` in the sibling project — write `docs/gitleaks-compatibility.md`): which engine to wrap, and why. `gitleaks` is the strongest default candidate — single binary, no network calls (verification-free by default, which matters for a fully local/offline privacy guarantee), fast, and its TOML ruleset + allowlist model maps cleanly onto VS Code config. Investigate whether it should be bundled per-platform (same binary-distribution problem this project already solved for `rustfmt` — reuse that pattern) or whether the user must install it themselves.

## 3. Non-negotiable safety invariants

- **Never transmit file contents anywhere.** No telemetry of scanned content, ever — not even aggregated or hashed. This is stricter than the sibling project's "don't log source code" rule: here it's "don't *transmit* it, period," because the whole point is protecting secrets.
- **Never modify `.gitignore` without an explicit, previewable, user-approved diff.** No auto-write on activation, no silent merge.
- **Never install a git hook without asking first**, and always provide an equally easy "uninstall/disable" path.
- **Never delete, rewrite, or force-push anything.** This extension only *blocks or warns*; it never touches git history.
- **A detected secret must never be logged, echoed into the output channel, or included verbatim in a notification** — only its location (file, line, rule name) and a redacted preview (e.g. first/last 2 characters).
- False positives must be suppressible only via an explicit, auditable allowlist file the user edits/approves — never an automatic "seen before, ignore forever" heuristic that could hide a real leak.

## 4. Architecture

```
VS Code Extension (TypeScript)
        |
        +-- Diagnostics provider (editor squiggles on save/open)
        +-- SCM integration (block/warn on commit via a git hook or a Source Control input decoration)
        +-- .gitignore Advisor (diff preview + explicit apply)
        |
        v
Secret-Scan Engine (wraps gitleaks CLI, stdin/stdout or file-path invocation)
        |
        +-- Ruleset (bundled default TOML + user-extendable custom rules)
        +-- Allowlist (user-maintained, explicit)
        |
        v
Git integration layer
        +-- pre-commit hook installer (core.hooksPath aware, cross-platform)
        +-- staged-diff scanning (git diff --cached, not full working tree, for commit-time checks)
```

Keep the VS Code layer, the git-hook installer, and the scan-engine wrapper in separate, independently testable modules — same separation of concerns as `extension/` vs `formatter/` in the sibling project.

## 5. Detection triggers (in priority order)

1. **On save** — lightweight, editor-local diagnostic squiggles on the specific line, non-blocking.
2. **On stage / pre-commit** — a git hook scans `git diff --cached` (only what's about to be committed, not the whole tree — keeps it fast and avoids flagging things the user already decided are fine and unstaged). Blocks the commit with a clear terminal + notification report if a high-confidence match is found; must be bypassable (e.g. `git commit --no-verify`, which is git's own standard escape hatch — don't invent a competing one) but the extension should surface a warning if a commit went through with `--no-verify` and a scan would have flagged it.
3. **On demand** — "Git Secret Guard: Scan Workspace" command for a full sweep (e.g. onboarding an existing repo).
4. **On push (optional, investigate feasibility)** — a pre-push hook scanning the commit range about to be pushed; document why this is or isn't included in v1 (likely: too slow for large histories without gitleaks' own `--log-opts` scoping — investigate before committing to it).
5. **On workspace open / manifest change** — read-only project-type detection for the `.gitignore` Advisor (§6); a dismissible notification when new suggestions appear, never a blocking prompt.

## 6. `.gitignore` Advisor, driven by automatic project-type detection

This is the "smart" part of the extension: the user should never have to know or pick which `.gitignore` template applies. The extension figures it out from the project itself.

### 6.1 Detection signals (combine, don't rely on just one)

- **Manifest files**, walked from the workspace/git root down (a monorepo may have several, in different subfolders — detect per-subtree, not just at the root): `package.json` (+ lockfile flavor: `package-lock.json`/`yarn.lock`/`pnpm-lock.yaml` hints at which tool's cache dirs to ignore), `Cargo.toml`, `pyproject.toml`/`requirements.txt`/`Pipfile`, `go.mod`, `pom.xml`/`build.gradle`/`build.gradle.kts`, `composer.json`, `Gemfile`, `*.csproj`/`*.sln`, `CMakeLists.txt`, `mix.exs`, `pubspec.yaml`.
- **Artifacts already on disk**, even without a manifest (covers partially-set-up or unusual projects): `node_modules/`, `target/` (Rust or Java/Maven — disambiguate using sibling manifest if present), `__pycache__/`, `.venv/`/`venv/`, `dist/`, `build/`, `.gradle/`, `vendor/` (PHP/Go), `.next/`, `bin/`/`obj/` (.NET).
- **Editor/OS layer**, always proposed regardless of stack: OS junk (`.DS_Store`, `Thumbs.db`) and, separately and clearly labeled, editor directories (`.vscode/`, `.idea/`) — flag `.vscode/` as *optional* rather than default-on, since many teams intentionally commit shared `launch.json`/`settings.json` (this extension's own sibling project does exactly that for its test fixtures — don't propose blanket-ignoring something teams often want tracked).

### 6.2 Template sourcing

Map detected stacks onto **bundled, local copies** of canonical templates (e.g. sourced once from [github/gitignore](https://github.com/github/gitignore) at build time, not fetched live at scan time — keeps the extension offline-capable and avoids a supply-chain dependency on a live network call during a security-sensitive operation). Bundle only the languages/tools worth covering in v1; document the list and how to extend it.

### 6.3 Merge behavior — this is where "safe" and "smart" have to coexist

- Never touch existing lines the user already wrote. New suggestions are **appended** in clearly delimited, labeled blocks (e.g. `# --- Rust (auto-detected) ---` … `# --- end Rust ---`), so a re-run can find its own previous block and update just that block rather than duplicating it.
- Idempotent: applying the same suggestion twice produces zero further diff.
- Re-detection triggers: workspace open (read-only scan, no prompt unless something's missing), and a new manifest file appearing (e.g. user runs `npm init` mid-session) — surface a subtle, dismissible notification ("New Node.js project detected — update .gitignore?"), never an intrusive modal, and never an unprompted write.
- Manual command: **"Git Secret Guard: Regenerate .gitignore Suggestions"** for an explicit full re-scan.
- Multi-root / monorepo: generate suggestions scoped to the nearest git root, but detect and label per-subtree stacks within it (a repo with both a `frontend/` (Node) and `backend/` (Rust) subfolder should get one merged `.gitignore` at the git root with both blocks, correctly labeled).

### 6.4 Secret-shaped-file detection (unchanged from the original scope, now a second detector feeding the same Advisor UI)

- Detects files matching common secret-file patterns (`.env*`, `*.pem`, `id_rsa*`, `credentials.json`, `*.p12`, `*.keystore`, service-account JSON shapes) that are **tracked or untracked-but-not-ignored**.
- Presents all findings — project-type suggestions and secret-file suggestions alike — through the same **diff preview** (a virtual document showing current `.gitignore` vs. proposed) — the user applies it via an explicit "Apply" action, never automatically.
- If a secret-shaped file is **already tracked by git**, adding it to `.gitignore` does nothing (git still tracks it) — the extension must detect this case specifically and tell the user the file needs `git rm --cached <file>` too, rather than giving false reassurance that `.gitignore` alone fixed it. This is the single most common real-world mistake this extension exists to prevent — get it right.

## 7. Configuration (keep it small)

| Setting | Purpose |
|---|---|
| `gitSecretGuard.blockCommitOnSecret` | hard-block vs. warn-only at commit time |
| `gitSecretGuard.scanOnSave` | toggle editor-time diagnostics |
| `gitSecretGuard.customRulesPath` | path to additional gitleaks-format TOML rules |
| `gitSecretGuard.allowlistPath` | path to the user-maintained allowlist |
| `gitSecretGuard.gitleaksPath` | override binary location (mirrors `rustPrettier.rustfmtPath` in the sibling project) |
| `gitSecretGuard.autoDetectProjectType` | enable/disable the smart `.gitignore` Advisor's project-type detection (§6); the secret-file detector in §6.4 is independent and stays on |
| `gitSecretGuard.notifyOnNewManifest` | toggle the "new project type detected" notification when a manifest file appears mid-session |

Document, per rule category, what's a default-on high-confidence check (private keys, cloud provider key formats) vs. default-off/noisy (generic high-entropy strings) — noisy generic entropy checks are the #1 source of extension-fatigue false positives; get the defaults conservative.

## 8. Testing strategy

- Fixture corpus of **known-real-shaped secrets** (using clearly-fake but pattern-valid examples, never real credentials) per provider, verifying detection.
- Fixture corpus of **known look-alikes** that must NOT trigger (e.g. a 40-char git commit hash, a UUID, a base64-encoded non-secret blob) — track false-positive rate as a real metric, not an afterthought.
- `.gitignore` merge idempotency: applying the advisor's suggestion twice produces no further diff.
- Project-type detection accuracy: a fixture corpus of sample project layouts (Node-only, Rust-only, Python-only, a Node+Rust monorepo, a project with build artifacts on disk but no manifest) each producing the expected, correctly-labeled suggestion blocks — and no stack false-positively detected from an unrelated file.
- Re-running detection after an unrelated edit produces zero new suggestions (no notification spam).
- Hook install/uninstall round-trip test, including the `core.hooksPath` case (not just `.git/hooks`).
- Cross-platform path handling for hook scripts (POSIX shell vs. what Windows git-bash needs).
- A test proving scanned content never appears in any log, output channel, or telemetry call — grep the extension's own output for fixture secret values as a CI check.

## 9. Deliverables

Working extension, the engine-wrapper CLI/module, `docs/architecture.md`, `docs/gitleaks-compatibility.md` (the "why wrap this tool, what does VS Code integration add" doc), configuration docs, CI, and a README that's explicit about what this extension does *not* catch (it's a safety net, not a guarantee — e.g. it can't unsee a secret already pushed to a public remote; document the "rotate the credential immediately" guidance for that case).

## 10. Definition of done

- Committing a fixture-fake AWS key is blocked with a clear, non-secret-echoing message.
- A look-alike (UUID, hash) does not trigger a false positive.
- `.gitignore` is never modified without an explicit apply action.
- The already-tracked-secret-file case correctly tells the user `.gitignore` alone isn't enough.
- No scanned content ever appears in logs, output channel, or any outbound network call.
- Hook install/uninstall is clean and documented.
