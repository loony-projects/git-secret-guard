import * as vscode from "vscode";
import { CONFIG_SECTION } from "./constants";

export interface GitSecretGuardConfig {
  blockCommitOnSecret: boolean;
  scanOnSave: boolean;
  customRulesPath: string;
  allowlistPath: string;
  gitleaksPath: string;
  autoDetectProjectType: boolean;
  notifyOnNewManifest: boolean;
}

export function readConfig(scope?: vscode.ConfigurationScope): GitSecretGuardConfig {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION, scope);
  return {
    blockCommitOnSecret: cfg.get<boolean>("blockCommitOnSecret", true),
    scanOnSave: cfg.get<boolean>("scanOnSave", true),
    customRulesPath: cfg.get<string>("customRulesPath", ""),
    allowlistPath: cfg.get<string>("allowlistPath", ""),
    gitleaksPath: cfg.get<string>("gitleaksPath", ""),
    autoDetectProjectType: cfg.get<boolean>("autoDetectProjectType", true),
    notifyOnNewManifest: cfg.get<boolean>("notifyOnNewManifest", true),
  };
}
