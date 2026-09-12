import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { findSecretShapedFiles } from "../../gitignoreAdvisor/secretFileDetector";

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd });
}

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gsg-secretfile-"));
  git(dir, ["init", "--quiet"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  return dir;
}

describe("secretFileDetector", () => {
  it("flags an untracked, non-ignored .env file", () => {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, ".env"), "SECRET=1\n");
    const findings = findSecretShapedFiles(dir);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].relativePath, ".env");
    assert.strictEqual(findings[0].alreadyTracked, false);
  });

  it("does not flag a file .gitignore already excludes", () => {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, ".gitignore"), ".env\n");
    fs.writeFileSync(path.join(dir, ".env"), "SECRET=1\n");
    const findings = findSecretShapedFiles(dir);
    assert.strictEqual(findings.length, 0);
  });

  it("distinguishes an already-tracked secret-shaped file from an untracked one", () => {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, "credentials.json"), "{}\n");
    git(dir, ["add", "credentials.json"]);
    git(dir, ["commit", "--quiet", "-m", "oops, committed credentials"]);

    fs.writeFileSync(path.join(dir, "id_rsa"), "not a real key\n");

    const findings = findSecretShapedFiles(dir);
    const byPath = new Map(findings.map((f) => [f.relativePath, f]));
    assert.strictEqual(byPath.get("credentials.json")?.alreadyTracked, true);
    assert.strictEqual(byPath.get("id_rsa")?.alreadyTracked, false);
  });

  it("does not flag a public key (*.pub) or a .env.example template", () => {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, "id_rsa.pub"), "ssh-rsa AAAAfake\n");
    fs.writeFileSync(path.join(dir, ".env.example"), "API_KEY=\n");
    const findings = findSecretShapedFiles(dir);
    assert.strictEqual(findings.length, 0);
  });
});
