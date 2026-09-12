# Bundled `.gitignore` templates

## Sourcing

Templates live at `extension/resources/gitignore-templates/*.gitignore` and
are bundled, local, plain-text fragments — not fetched from
[github/gitignore](https://github.com/github/gitignore) at scan time. The
product spec calls for templates "sourced once... at build time, not
fetched live at scan time," to keep the extension offline-capable and avoid
a supply-chain dependency on a live network call during a security-sensitive
operation.

This repository hand-authors these fragments rather than mirroring
github/gitignore's files byte-for-byte, for the same build-time-safety
reason `docs/gitleaks-compatibility.md` gives for the ruleset: no automated
process fetches and vendors a third-party file into this project. Each
fragment is a small, reviewed subset of the ignores that actually matter for
the "don't commit build output or secrets" goal this extension exists for —
not a complete reproduction of every editor/tool-specific line the upstream
templates carry. If you want a stack's fragment to track upstream more
closely, that's a normal PR: edit the file, no other code changes needed.

## Stacks covered in v1

| Stack | Template key | File | Detected via |
|---|---|---|---|
| Node.js | `node` | `Node.gitignore` | `package.json` manifest, or `node_modules/` on disk |
| Rust | `rust` | `Rust.gitignore` | `Cargo.toml` manifest |
| Python | `python` | `Python.gitignore` | `pyproject.toml` / `requirements.txt` / `Pipfile`, or `__pycache__/`/`.venv/`/`venv/` on disk |
| Go | `go` | `Go.gitignore` | `go.mod` manifest |
| Java (Maven) | `java-maven` | `JavaMaven.gitignore` | `pom.xml` manifest |
| Java (Gradle) | `java-gradle` | `JavaGradle.gitignore` | `build.gradle`/`build.gradle.kts` manifest, or `.gradle/` on disk |
| PHP | `php` | `PHP.gitignore` | `composer.json` manifest |
| Ruby | `ruby` | `Ruby.gitignore` | `Gemfile` manifest |
| .NET | `dotnet` | `DotNet.gitignore` | `*.csproj`/`*.sln` manifest |
| C/C++ (CMake) | `cmake` | `CMake.gitignore` | `CMakeLists.txt` manifest |
| Elixir | `elixir` | `Elixir.gitignore` | `mix.exs` manifest |
| Dart/Flutter | `dart` | `Dart.gitignore` | `pubspec.yaml` manifest |
| OS junk (always proposed) | `os` | `OS.gitignore` | n/a — proposed alongside any other detected stack |
| Editor dirs (optional, commented out) | `editor` | `Editor.gitignore` | n/a — proposed alongside any other detected stack, inert until manually uncommented |
| Ambiguous `target/`, no manifest | `generic-target` | `GenericTarget.gitignore` | `target/` on disk with neither `Cargo.toml` nor `pom.xml` alongside it |
| Ambiguous `vendor/`, no manifest | `generic-vendor` | `GenericVendor.gitignore` | `vendor/` on disk with neither `composer.json` nor `go.mod` alongside it |

## Adding a stack

1. Add the manifest and/or artifact-directory signal(s) to
   `extension/src/gitignoreAdvisor/projectDetector.ts` — either a new entry
   in `MANIFEST_SIGNALS` (a file whose mere presence identifies the stack)
   or `ARTIFACT_SIGNALS` (a directory that appears once the stack has been
   used, with `impliedByManifests` listing any manifest that would make this
   redundant).
2. Add the template key to `TEMPLATE_FILES` in
   `extension/src/gitignoreAdvisor/templates.ts`.
3. Add the fragment file itself under
   `extension/resources/gitignore-templates/`.
4. Add a fixture under `fixtures/projects/<stack>-only/` and a test case in
   `extension/src/test/unit/projectDetector.test.ts`.

Two disambiguation patterns worth reusing if the new stack's build-artifact
directory name collides with an existing one (the way `target/` collides
between Rust and Java/Maven, and `vendor/` between PHP and Go): check for a
sibling manifest first, and fall back to a generic, honestly-labeled
suggestion ("Build output", not a guessed stack name) rather than picking
the wrong one.
