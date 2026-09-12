import * as fs from "fs";
import * as path from "path";

export interface StackDetection {
  /** Label used in the auto-managed block header, e.g. "Node.js", "Rust". */
  label: string;
  /** Template key used to look up the bundled fragment (templates.ts). */
  templateKey: string;
  /** Path of the subtree this was detected in, relative to the scan root ("" for the root itself). */
  subtree: string;
  /** Human-readable signals that led to detection, for the diff preview's explanatory comment. */
  signals: string[];
}

const ALWAYS_SKIP_DIRS = new Set([".git", "node_modules", "target", ".venv", "venv", "vendor", ".gradle", "dist", "build", ".next", "bin", "obj", "__pycache__"]);

const MAX_DEPTH = 4;

interface ManifestSignal {
  file: string;
  label: string;
  templateKey: string;
}

const MANIFEST_SIGNALS: ManifestSignal[] = [
  { file: "package.json", label: "Node.js", templateKey: "node" },
  { file: "Cargo.toml", label: "Rust", templateKey: "rust" },
  { file: "pyproject.toml", label: "Python", templateKey: "python" },
  { file: "requirements.txt", label: "Python", templateKey: "python" },
  { file: "Pipfile", label: "Python", templateKey: "python" },
  { file: "go.mod", label: "Go", templateKey: "go" },
  { file: "pom.xml", label: "Java (Maven)", templateKey: "java-maven" },
  { file: "build.gradle", label: "Java (Gradle)", templateKey: "java-gradle" },
  { file: "build.gradle.kts", label: "Java (Gradle)", templateKey: "java-gradle" },
  { file: "composer.json", label: "PHP", templateKey: "php" },
  { file: "Gemfile", label: "Ruby", templateKey: "ruby" },
  { file: "CMakeLists.txt", label: "C/C++ (CMake)", templateKey: "cmake" },
  { file: "mix.exs", label: "Elixir", templateKey: "elixir" },
  { file: "pubspec.yaml", label: "Dart/Flutter", templateKey: "dart" },
];

interface ArtifactSignal {
  dir: string;
  label: string;
  templateKey: string;
  /** Manifest files that, if present in the same directory, already imply this stack — skip to avoid duplicates. */
  impliedByManifests: string[];
}

const ARTIFACT_SIGNALS: ArtifactSignal[] = [
  { dir: "node_modules", label: "Node.js", templateKey: "node", impliedByManifests: ["package.json"] },
  { dir: "__pycache__", label: "Python", templateKey: "python", impliedByManifests: ["pyproject.toml", "requirements.txt", "Pipfile"] },
  { dir: ".venv", label: "Python", templateKey: "python", impliedByManifests: ["pyproject.toml", "requirements.txt", "Pipfile"] },
  { dir: "venv", label: "Python", templateKey: "python", impliedByManifests: ["pyproject.toml", "requirements.txt", "Pipfile"] },
  { dir: ".gradle", label: "Java (Gradle)", templateKey: "java-gradle", impliedByManifests: ["build.gradle", "build.gradle.kts"] },
];

/** Manifest file basenames worth watching for mid-session ("new project type detected") notifications. */
export const MANIFEST_FILE_NAMES = MANIFEST_SIGNALS.map((s) => s.file);

function isCsprojOrSln(fileName: string): boolean {
  return fileName.endsWith(".csproj") || fileName.endsWith(".sln");
}

function listDirSafe(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Walks from `rootDir` down (bounded depth, skipping known artifact/vendor
 * directories so we never recurse INTO node_modules etc.) looking for
 * per-subtree manifests and on-disk build artifacts. A monorepo with
 * `frontend/` (Node) and `backend/` (Rust) gets two StackDetections, each
 * labeled with its own subtree.
 */
export function detectStacks(rootDir: string): StackDetection[] {
  const detections: StackDetection[] = [];
  walk(rootDir, "", 0, detections);
  return dedupeBySubtreeAndLabel(detections);
}

function walk(rootDir: string, relativeDir: string, depth: number, out: StackDetection[]): void {
  const absoluteDir = path.join(rootDir, relativeDir);
  const entries = listDirSafe(absoluteDir);
  const fileNames = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
  const dirNames = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));

  for (const signal of MANIFEST_SIGNALS) {
    if (fileNames.has(signal.file)) {
      out.push({
        label: signal.label,
        templateKey: signal.templateKey,
        subtree: relativeDir,
        signals: [path.join(relativeDir, signal.file) || signal.file],
      });
    }
  }
  for (const fileName of fileNames) {
    if (isCsprojOrSln(fileName)) {
      out.push({
        label: ".NET",
        templateKey: "dotnet",
        subtree: relativeDir,
        signals: [path.join(relativeDir, fileName) || fileName],
      });
    }
  }

  const manifestsHere = MANIFEST_SIGNALS.filter((s) => fileNames.has(s.file)).map((s) => s.file);
  for (const artifact of ARTIFACT_SIGNALS) {
    if (dirNames.has(artifact.dir) && !artifact.impliedByManifests.some((m) => manifestsHere.includes(m))) {
      out.push({
        label: artifact.label,
        templateKey: artifact.templateKey,
        subtree: relativeDir,
        signals: [path.join(relativeDir, artifact.dir) || artifact.dir],
      });
    }
  }

  // target/ is ambiguous between Rust and Java/Maven — disambiguate via sibling manifest.
  if (dirNames.has("target")) {
    if (fileNames.has("Cargo.toml")) {
      // already covered by the Rust manifest signal above.
    } else if (fileNames.has("pom.xml")) {
      // already covered by the Java (Maven) manifest signal above.
    } else {
      out.push({
        label: "Build output",
        templateKey: "generic-target",
        subtree: relativeDir,
        signals: [path.join(relativeDir, "target") || "target"],
      });
    }
  }

  // vendor/ is ambiguous between PHP and Go.
  if (dirNames.has("vendor")) {
    if (fileNames.has("composer.json")) {
      // already covered by the PHP manifest signal above.
    } else if (fileNames.has("go.mod")) {
      // already covered by the Go manifest signal above.
    } else {
      out.push({
        label: "Vendor directory",
        templateKey: "generic-vendor",
        subtree: relativeDir,
        signals: [path.join(relativeDir, "vendor") || "vendor"],
      });
    }
  }

  // bin/ or obj/ without a .csproj/.sln in this directory: ambiguous, skip rather than guess wrong.
  const hasDotnetManifestHere = [...fileNames].some(isCsprojOrSln);
  if (!hasDotnetManifestHere && (dirNames.has("bin") || dirNames.has("obj"))) {
    // Too many stacks legitimately use bin/ (Go, generic scripts) — require the manifest signal for .NET.
  }

  if (depth >= MAX_DEPTH) {
    return;
  }
  for (const dirName of dirNames) {
    if (dirName.startsWith(".") && dirName !== ".") {
      continue;
    }
    if (ALWAYS_SKIP_DIRS.has(dirName)) {
      continue;
    }
    walk(rootDir, path.join(relativeDir, dirName), depth + 1, out);
  }
}

function dedupeBySubtreeAndLabel(detections: StackDetection[]): StackDetection[] {
  const byKey = new Map<string, StackDetection>();
  for (const d of detections) {
    const key = `${d.subtree}::${d.label}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.signals = Array.from(new Set([...existing.signals, ...d.signals]));
    } else {
      byKey.set(key, { ...d, signals: [...d.signals] });
    }
  }
  return Array.from(byKey.values());
}
