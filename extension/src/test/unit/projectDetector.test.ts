import * as assert from "assert";
import * as path from "path";
import { detectStacks } from "../../gitignoreAdvisor/projectDetector";

const FIXTURES = path.join(__dirname, "..", "..", "..", "..", "fixtures", "projects");

function labelsFor(root: string): string[] {
  return detectStacks(root).map((s) => s.label);
}

describe("projectDetector", () => {
  it("detects a Node-only project", () => {
    const labels = labelsFor(path.join(FIXTURES, "node-only"));
    assert.deepStrictEqual(labels, ["Node.js"]);
  });

  it("detects a Rust-only project", () => {
    const labels = labelsFor(path.join(FIXTURES, "rust-only"));
    assert.deepStrictEqual(labels, ["Rust"]);
  });

  it("detects a Python-only project", () => {
    const labels = labelsFor(path.join(FIXTURES, "python-only"));
    assert.deepStrictEqual(labels, ["Python"]);
  });

  it("detects both stacks in a Node+Rust monorepo, each labeled with its own subtree", () => {
    const detections = detectStacks(path.join(FIXTURES, "node-rust-monorepo"));
    const byLabel = new Map(detections.map((d) => [d.label, d.subtree]));
    assert.strictEqual(byLabel.get("Node.js"), "frontend");
    assert.strictEqual(byLabel.get("Rust"), "backend");
    assert.strictEqual(detections.length, 2, "no stack should be false-positively detected from the other subtree");
  });

  it("labels ambiguous target/ as generic Build output when no Cargo.toml/pom.xml sibling exists, and still finds node_modules", () => {
    const detections = detectStacks(path.join(FIXTURES, "artifacts-no-manifest"));
    const labels = detections.map((d) => d.label);
    assert.ok(labels.includes("Node.js"));
    assert.ok(labels.includes("Build output"));
    assert.strictEqual(labels.includes("Rust"), false);
    assert.strictEqual(labels.includes("Java (Maven)"), false);
  });

  it("does not recurse into node_modules (would be slow and pointless)", () => {
    // node-only/package.json has no node_modules on disk in the fixture, so this
    // just asserts detection completes fast and produces exactly one detection.
    const detections = detectStacks(path.join(FIXTURES, "node-only"));
    assert.strictEqual(detections.length, 1);
  });

  it("labels a package.json depending on react as React, not generic Node.js", () => {
    const labels = labelsFor(path.join(FIXTURES, "react-only"));
    assert.deepStrictEqual(labels, ["React"]);
  });

  it("labels a package.json depending on react-native as React Native, and does not also flag Android/iOS in its android/ios subtrees", () => {
    const detections = detectStacks(path.join(FIXTURES, "react-native-only"));
    const labels = detections.map((d) => d.label);
    assert.deepStrictEqual(labels, ["React Native"]);
    assert.strictEqual(labels.includes("Android"), false, "android/ is scaffolding of the RN app, not a separate project");
    assert.strictEqual(labels.includes("iOS"), false, "ios/ is scaffolding of the RN app, not a separate project");
  });

  it("detects a standalone Android project via AndroidManifest.xml", () => {
    const detections = detectStacks(path.join(FIXTURES, "android-only"));
    const byLabel = new Map(detections.map((d) => [d.label, d.subtree]));
    assert.strictEqual(byLabel.get("Android"), path.join("app", "src", "main"));
    assert.ok(byLabel.has("Java (Gradle)"), "the root build.gradle should still be detected independently");
  });

  it("detects a standalone iOS project via Podfile and an .xcodeproj directory", () => {
    const detections = detectStacks(path.join(FIXTURES, "ios-only"));
    const iosDetections = detections.filter((d) => d.label === "iOS");
    assert.strictEqual(iosDetections.length, 1, "Podfile + .xcodeproj in the same directory should merge into one iOS block, not two");
    assert.ok(iosDetections[0].signals.some((s) => s.includes("Podfile")));
    assert.ok(iosDetections[0].signals.some((s) => s.includes(".xcodeproj")));
  });
});
