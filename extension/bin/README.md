# Bundled gitleaks binaries

This directory is empty in the repository. CI populates
`<platform>-<arch>/gitleaks[.exe]` here at package time by running
`scripts/fetch-gitleaks.sh`, which downloads a pinned gitleaks release from
its GitHub releases and verifies its checksum before placing it here — see
`docs/gitleaks-compatibility.md` for why a binary isn't vendored directly in
version control.

Expected layout once populated:

```
bin/
  linux-x64/gitleaks
  linux-arm64/gitleaks
  macos-x64/gitleaks
  macos-arm64/gitleaks
  windows-x64/gitleaks.exe
```

For local development without a packaged `.vsix`, it's simpler to just
install gitleaks yourself (`brew install gitleaks`, `go install
github.com/gitleaks/gitleaks/v8@latest`, or a release binary on PATH) —
`src/scanEngine/binaryResolver.ts` falls back to PATH automatically.
