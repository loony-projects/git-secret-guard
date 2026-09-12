import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { installHooks, uninstallHooks, isHooksInstalled } from "../../git/hookInstaller";
import { HOOK_MARKER } from "../../constants";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gsg-hooks-"));
  git(dir, ["init", "--quiet"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  return dir;
}

const installOptions = {
  binaryPath: "gitleaks",
  blockCommitOnSecret: true,
  effectiveConfig: 'title = "t"\n',
};

describe("hookInstaller", () => {
  it("installs pre-commit and post-commit hooks, executable, with our marker", () => {
    const repo = makeRepo();
    const result = installHooks(repo, installOptions);

    for (const name of ["pre-commit", "post-commit"]) {
      const hookPath = path.join(result.hooksDir, name);
      assert.ok(fs.existsSync(hookPath));
      const content = fs.readFileSync(hookPath, "utf8");
      assert.ok(content.includes(HOOK_MARKER));
      const mode = fs.statSync(hookPath).mode;
      assert.ok((mode & 0o111) !== 0, `${name} should be executable`);
    }
    assert.strictEqual(isHooksInstalled(repo), true);
  });

  it("is idempotent on reinstall (upgrade), not producing duplicate content", () => {
    const repo = makeRepo();
    installHooks(repo, installOptions);
    const result = installHooks(repo, { ...installOptions, blockCommitOnSecret: false });

    const content = fs.readFileSync(path.join(result.hooksDir, "pre-commit"), "utf8");
    assert.strictEqual((content.match(new RegExp(HOOK_MARKER, "g")) ?? []).length, 1);
    assert.ok(content.includes("BLOCK_ON_SECRET=0"));
  });

  it("backs up a pre-existing foreign hook instead of overwriting it", () => {
    const repo = makeRepo();
    const hooksDir = path.join(repo, ".git", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, "pre-commit"), "#!/bin/sh\necho 'some other tool'\n", { mode: 0o755 });

    const result = installHooks(repo, installOptions);
    assert.strictEqual(result.backedUpForeignHooks.length, 1);
    assert.ok(fs.existsSync(result.backedUpForeignHooks[0]));
    assert.ok(fs.readFileSync(result.backedUpForeignHooks[0], "utf8").includes("some other tool"));
    assert.ok(fs.readFileSync(path.join(hooksDir, "pre-commit"), "utf8").includes(HOOK_MARKER));
  });

  it("uninstalls cleanly and restores a backed-up foreign hook", () => {
    const repo = makeRepo();
    const hooksDir = path.join(repo, ".git", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, "pre-commit"), "#!/bin/sh\necho 'original'\n", { mode: 0o755 });

    installHooks(repo, installOptions);
    const uninstallResult = uninstallHooks(repo);

    assert.strictEqual(uninstallResult.removedHooks.length, 2);
    assert.strictEqual(isHooksInstalled(repo), false);
    assert.ok(fs.readFileSync(path.join(hooksDir, "pre-commit"), "utf8").includes("original"));
  });

  it("uninstall round-trip leaves no managed files when nothing was backed up", () => {
    const repo = makeRepo();
    installHooks(repo, installOptions);
    uninstallHooks(repo);
    const hooksDir = path.join(repo, ".git", "hooks");
    assert.strictEqual(fs.existsSync(path.join(hooksDir, "pre-commit")), false);
    assert.strictEqual(fs.existsSync(path.join(hooksDir, "post-commit")), false);
    assert.strictEqual(fs.existsSync(path.join(hooksDir, "git-secret-guard-effective-config.toml")), false);
  });

  it("honors a custom core.hooksPath instead of .git/hooks", () => {
    const repo = makeRepo();
    const customHooksDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsg-custom-hooks-"));
    git(repo, ["config", "core.hooksPath", customHooksDir]);

    const result = installHooks(repo, installOptions);
    assert.strictEqual(result.hooksDir, customHooksDir);
    assert.ok(fs.existsSync(path.join(customHooksDir, "pre-commit")));
    assert.strictEqual(fs.existsSync(path.join(repo, ".git", "hooks", "pre-commit")), false);
  });
});
