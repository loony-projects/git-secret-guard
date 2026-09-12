import * as assert from "assert";
import { buildPreCommitScript, buildPostCommitScript } from "../../git/hookScripts";

const OPTIONS = { binaryPath: "/usr/local/bin/gitleaks", configPath: "/repo/.git/hooks/config.toml", blockCommitOnSecret: true };

/**
 * Both hooks are a single POSIX `#!/bin/sh` script rather than separate
 * platform-specific implementations — Git for Windows already runs hooks
 * through its bundled `sh`, so this is a cross-platform test of "did we
 * accidentally introduce something that only works on one platform"
 * (CRLF line endings, a bash-only construct, a hard-coded path separator).
 */
describe("hook scripts", () => {
  for (const [name, build] of [
    ["pre-commit", buildPreCommitScript],
    ["post-commit", buildPostCommitScript],
  ] as const) {
    it(`${name} script uses a POSIX shebang and only LF line endings`, () => {
      const script = build(OPTIONS);
      assert.ok(script.startsWith("#!/bin/sh\n"));
      assert.strictEqual(script.includes("\r\n"), false, "must not contain CRLF line endings");
      assert.strictEqual(script.includes("\\"), false, "must not contain a Windows-style backslash path");
    });

    it(`${name} script never contains a bash-only construct (stays POSIX sh)`, () => {
      const script = build(OPTIONS);
      assert.strictEqual(/\[\[.*\]\]/.test(script), false, "[[ ]] is bash-only, not POSIX sh");
      assert.strictEqual(script.includes("local "), false, "local is not POSIX sh");
    });
  }

  it("pre-commit exits non-zero on a finding only when blockCommitOnSecret is true", () => {
    const blocking = buildPreCommitScript({ ...OPTIONS, blockCommitOnSecret: true });
    const warnOnly = buildPreCommitScript({ ...OPTIONS, blockCommitOnSecret: false });
    assert.ok(blocking.includes("BLOCK_ON_SECRET=1"));
    assert.ok(warnOnly.includes("BLOCK_ON_SECRET=0"));
  });

  it("post-commit uses --redact so a raw secret is never written to the alert file", () => {
    const script = buildPostCommitScript(OPTIONS);
    assert.ok(script.includes("--redact"));
  });

  it("every script carries the managed marker so the installer can tell it apart from a foreign hook", () => {
    assert.ok(buildPreCommitScript(OPTIONS).includes("git-secret-guard:managed"));
    assert.ok(buildPostCommitScript(OPTIONS).includes("git-secret-guard:managed"));
  });
});
