import * as assert from "assert";
import { mergeGitignore, isUpToDate, GitignoreBlock } from "../../gitignoreAdvisor/merge";

describe(".gitignore merge", () => {
  it("never touches lines the user wrote", () => {
    const existing = "# my custom notes\nmy-secret-local-file.txt\n";
    const blocks: GitignoreBlock[] = [{ label: "Node.js", content: "node_modules/\ndist/" }];
    const merged = mergeGitignore(existing, blocks);
    assert.ok(merged.includes("# my custom notes"));
    assert.ok(merged.includes("my-secret-local-file.txt"));
  });

  it("appends a new block with start/end markers", () => {
    const merged = mergeGitignore("", [{ label: "Node.js", content: "node_modules/" }]);
    assert.ok(merged.includes("# --- Node.js (auto-detected) ---"));
    assert.ok(merged.includes("node_modules/"));
    assert.ok(merged.includes("# --- end Node.js ---"));
  });

  it("is idempotent: applying the same blocks twice produces zero further diff", () => {
    const blocks: GitignoreBlock[] = [
      { label: "Node.js", content: "node_modules/\ndist/" },
      { label: "Rust", content: "target/" },
    ];
    const once = mergeGitignore("", blocks);
    const twice = mergeGitignore(once, blocks);
    assert.strictEqual(once, twice);
    assert.ok(isUpToDate(once, blocks));
  });

  it("replaces its own previous block in place on re-run, rather than duplicating it", () => {
    const first = mergeGitignore("", [{ label: "Node.js", content: "node_modules/" }]);
    const updated = mergeGitignore(first, [{ label: "Node.js", content: "node_modules/\ndist/" }]);

    const occurrences = updated.match(/# --- Node\.js \(auto-detected\) ---/g) ?? [];
    assert.strictEqual(occurrences.length, 1, "must not duplicate the block header");
    assert.ok(updated.includes("dist/"));
  });

  it("appends multiple distinct blocks without cross-contamination", () => {
    const merged = mergeGitignore("", [
      { label: "Node.js (frontend/)", content: "frontend/node_modules/" },
      { label: "Rust (backend/)", content: "backend/target/" },
    ]);
    assert.ok(merged.includes("# --- Node.js (frontend/) (auto-detected) ---"));
    assert.ok(merged.includes("# --- Rust (backend/) (auto-detected) ---"));
    assert.ok(merged.includes("frontend/node_modules/"));
    assert.ok(merged.includes("backend/target/"));
  });

  it("leaves a stale block for a no-longer-detected stack untouched (never destructively removed)", () => {
    const withRust = mergeGitignore("", [{ label: "Rust", content: "target/" }]);
    const reRunWithoutRust = mergeGitignore(withRust, []);
    assert.strictEqual(withRust, reRunWithoutRust);
  });
});
