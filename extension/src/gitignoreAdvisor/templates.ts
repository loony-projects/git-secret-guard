import * as fs from "fs";
import * as path from "path";

/** Maps a projectDetector.ts templateKey to the bundled fragment file in resources/gitignore-templates/. */
const TEMPLATE_FILES: Record<string, string> = {
  node: "Node.gitignore",
  react: "React.gitignore",
  "react-native": "ReactNative.gitignore",
  android: "Android.gitignore",
  ios: "iOS.gitignore",
  rust: "Rust.gitignore",
  python: "Python.gitignore",
  go: "Go.gitignore",
  "java-maven": "JavaMaven.gitignore",
  "java-gradle": "JavaGradle.gitignore",
  php: "PHP.gitignore",
  ruby: "Ruby.gitignore",
  dotnet: "DotNet.gitignore",
  cmake: "CMake.gitignore",
  elixir: "Elixir.gitignore",
  dart: "Dart.gitignore",
  os: "OS.gitignore",
  editor: "Editor.gitignore",
  "generic-target": "GenericTarget.gitignore",
  "generic-vendor": "GenericVendor.gitignore",
};

export function templateKeys(): string[] {
  return Object.keys(TEMPLATE_FILES);
}

export function loadTemplate(resourcesDir: string, templateKey: string): string {
  const fileName = TEMPLATE_FILES[templateKey];
  if (!fileName) {
    throw new Error(`No bundled .gitignore template for key "${templateKey}"`);
  }
  const filePath = path.join(resourcesDir, "gitignore-templates", fileName);
  return fs.readFileSync(filePath, "utf8");
}
