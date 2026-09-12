# Configuration

All settings live under the `gitSecretGuard.*` prefix.

| Setting | Default | Purpose |
|---|---|---|
| `gitSecretGuard.blockCommitOnSecret` | `true` | Hard-block a commit when the pre-commit hook finds a high-confidence secret. When `false`, the hook still runs and warns, but lets the commit through. |
| `gitSecretGuard.scanOnSave` | `true` | Scan the active file for secrets on save (via `gitleaks stdin`) and show editor diagnostics. |
| `gitSecretGuard.customRulesPath` | `""` | Path to additional gitleaks-format TOML rules, merged with the bundled default ruleset. See "Fragment file format" below. |
| `gitSecretGuard.allowlistPath` | `""` | Path to a user-maintained gitleaks-format TOML allowlist (paths/regexes/stopwords). **This is the only supported way to suppress a false positive** — there is no "dismiss forever" button, by design (an automatic heuristic that hides a finding could hide a real leak). |
| `gitSecretGuard.gitleaksPath` | `""` | Override the gitleaks binary location. Empty resolves a bundled binary if present, otherwise `gitleaks` from `PATH`. |
| `gitSecretGuard.autoDetectProjectType` | `true` | Enables the `.gitignore` Advisor's automatic project-type detection (manifests + on-disk artifacts). The secret-shaped-file detector is independent and always stays on, regardless of this setting. |
| `gitSecretGuard.notifyOnNewManifest` | `true` | Show a dismissible notification when a new manifest file (e.g. `package.json`) appears mid-session, offering updated `.gitignore` suggestions. |

## The bundled ruleset: what's on by default, and why

`extension/resources/gitleaks/default.toml` is curated, not vendored from
upstream gitleaks (see `docs/gitleaks-compatibility.md` for the full
reasoning). Every rule in it is **on by default**, and every one is anchored
to something structural — a provider's key-prefix format, a PEM header, or a
recognizable secret-sounding assignment — specifically to avoid the
false-positive fatigue that comes from matching on entropy alone:

| Category | Rules | Confidence |
|---|---|---|
| Private keys | `pem-private-key` | High — a PEM header is unambiguous. |
| Cloud provider keys | `aws-access-key-id`, `aws-secret-access-key`, `gcp-api-key`, `azure-storage-account-key` | High — fixed prefixes/formats. `aws-secret-access-key` is anchored to an `aws_secret_access_key =` assignment specifically so a bare 40-character hex string (e.g. a git commit hash) never matches. |
| Source-control / registry tokens | `github-token-classic`, `github-token-fine-grained`, `gitlab-pat`, `npm-token` | High — fixed prefixes. |
| Chat / messaging | `slack-token`, `slack-webhook-url` | High — fixed prefixes/URL shape. |
| Payments / AI | `stripe-live-key`, `openai-api-key`, `anthropic-api-key` | High — fixed prefixes. Stripe *test* keys (`sk_test_`) are intentionally not flagged; they carry no real risk. |
| Communications | `twilio-api-key-sid`, `twilio-auth-token`, `sendgrid-api-key` | High. `twilio-auth-token` is context-anchored to a `twilio...auth_token=` assignment — a bare 32-character hex string is otherwise indistinguishable from many non-secrets. |
| Structural | `jwt` | Moderate — three dot-separated base64url segments starting `ey` is a strong structural signal, but a JWT isn't always a live credential (could be a test fixture token). |
| Connection strings | `connection-string-with-password` | High — requires a non-empty password segment in a `scheme://user:pass@host` URL. |
| `.env`-style assignments | `dotenv-style-secret-assignment` | Moderate — anchored to a secret-sounding key name (`SECRET`, `PASSWORD`, `API_KEY`, `CLIENT_SECRET`, etc.), not entropy. A small built-in allowlist regex excludes obvious placeholders (`changeme`, `example`, `<your-api-key>`, etc.). |

### What's deliberately *not* included by default

**Generic high-entropy string detection** — matching "this looks random"
without any structural anchor — is not in `default.toml` at all. gitleaks
has no per-rule "disabled" flag; the only way to keep a rule out of the
default path is to not ship it in the file gitleaks is pointed at. A ready
rule for this is bundled separately at
`extension/resources/gitleaks/optional-generic-entropy.toml`, documented
there as opt-in: copy it into your own custom rules file and point
`gitSecretGuard.customRulesPath` at it if you want this coverage and are
prepared for its false-positive rate (a CSS/asset hash, a base64-encoded
test fixture, and a UUID with dashes stripped can all "look random").

## Fragment file format for `customRulesPath` and `allowlistPath`

Both files are merged into one effective gitleaks TOML config at invocation
time (`src/scanEngine/configMerge.ts`) alongside the bundled default. To
keep that merge unambiguous, both are expected to be **fragment files**:
only `[[rules]]` and/or `[allowlist]` tables, no other top-level keys (no
`title`, no `[extend]`) — anything else is silently ignored rather than
guessed at, since TOML has no notion of "this repeated key wins."

**Custom rules example** (`.gitleaks-custom-rules.toml`):

```toml
[[rules]]
id = "acme-internal-token"
description = "Acme Corp internal service token"
regex = '''\bacme_[A-Za-z0-9]{32}\b'''
tags = ["acme", "high-confidence"]
```

**Allowlist example** (`.gitleaks-allowlist.toml`) — note arrays must be
written on a single line (the merge logic parses them that way):

```toml
[allowlist]
description = "Known-safe values reviewed by the team"
paths = [ '''^fixtures/.*''', '''\.env\.example$''' ]
regexes = [ '''sk_test_[A-Za-z0-9]+''' ]
stopwords = [ '''EXAMPLE_NOT_A_REAL_SECRET''' ]
```

Commit both files if you want the team to share them; they're just TOML
text, no different from committing an ESLint config.

## Secret-shaped-file detection defaults

Independent of `autoDetectProjectType`, the Advisor always checks for files
matching common secret-file shapes among files that are tracked or
untracked-but-not-ignored: `.env*` (excluding `.example`/`.sample`/
`.template`/`.dist` suffixes — those are conventionally safe templates
meant to be committed), `*.pem`, `id_rsa`/`id_dsa`/`id_ecdsa`/`id_ed25519`
(deliberately **excluding** `*.pub` — a public key is not a secret),
`credentials*.json`, `*service*account*.json`, `*.p12`/`*.pfx`,
`*.keystore`/`*.jks`. If a match is already tracked by git, the Advisor's
message says so explicitly and gives the `git rm --cached <file>` command —
adding it to `.gitignore` alone does not remove it from git.

## Bundled `.gitignore` templates

See `docs/gitignore-templates.md` for the full list of stacks covered and
how to add another one.
