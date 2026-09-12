import * as fs from "fs";
import * as path from "path";
import { mergeGitleaksConfigs } from "./configMerge";

export interface EffectiveConfigOptions {
  extensionPath: string;
  customRulesPath: string;
  allowlistPath: string;
}

function readIfExists(filePath: string): string | undefined {
  if (!filePath || filePath.trim().length === 0) {
    return undefined;
  }
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
}

/** Builds the effective merged TOML config text (see configMerge.ts) from the bundled default plus optional user files. */
export function buildEffectiveConfig(options: EffectiveConfigOptions): string {
  const defaultTomlPath = path.join(options.extensionPath, "resources", "gitleaks", "default.toml");
  const defaultToml = fs.readFileSync(defaultTomlPath, "utf8");
  const customToml = readIfExists(options.customRulesPath);
  const allowlistToml = readIfExists(options.allowlistPath);
  return mergeGitleaksConfigs(defaultToml, customToml, allowlistToml);
}
