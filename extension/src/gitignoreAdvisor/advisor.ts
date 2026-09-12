import * as fs from "fs";
import { detectStacks } from "./projectDetector";
import { loadTemplate } from "./templates";
import { mergeGitignore, GitignoreBlock } from "./merge";
import { findSecretShapedFiles, SecretFileFinding } from "./secretFileDetector";

export interface AdvisorOptions {
  repoRoot: string;
  resourcesDir: string;
  autoDetectProjectType: boolean;
  gitignorePath: string;
}

export interface AdvisorProposal {
  blocks: GitignoreBlock[];
  secretFileFindings: SecretFileFinding[];
  currentContent: string;
  proposedContent: string;
  hasChanges: boolean;
}

/**
 * Pure computation of what the Advisor would propose — no vscode
 * dependency, so this is fully unit-testable. Never writes anything;
 * see applyProposal for the one place that does, which is only ever called
 * after the user explicitly approves the diff preview.
 */
export function buildProposal(options: AdvisorOptions): AdvisorProposal {
  const blocks: GitignoreBlock[] = [];

  if (options.autoDetectProjectType) {
    const stacks = detectStacks(options.repoRoot);
    for (const stack of stacks) {
      const label = stack.subtree ? `${stack.label} (${stack.subtree}/)` : stack.label;
      const template = loadTemplate(options.resourcesDir, stack.templateKey);
      const comment = `# Detected via: ${stack.signals.join(", ")}`;
      blocks.push({ label, content: `${comment}\n${template}` });
    }

    if (stacks.length > 0) {
      blocks.push({ label: "OS", content: loadTemplate(options.resourcesDir, "os") });
      blocks.push({ label: "Editor", content: loadTemplate(options.resourcesDir, "editor") });
    }
  }

  const secretFileFindings = safeFindSecretShapedFiles(options.repoRoot);
  if (secretFileFindings.length > 0) {
    const lines = secretFileFindings.map((finding) => {
      const note = finding.alreadyTracked
        ? ` # already tracked by git -- .gitignore alone will NOT remove it; also run: git rm --cached "${finding.relativePath}"`
        : ` # matched: ${finding.matchedPattern}`;
      return `/${finding.relativePath}${note}`;
    });
    blocks.push({ label: "Secrets", content: lines.join("\n") });
  }

  const currentContent = fs.existsSync(options.gitignorePath) ? fs.readFileSync(options.gitignorePath, "utf8") : "";
  const proposedContent = mergeGitignore(currentContent, blocks);

  return {
    blocks,
    secretFileFindings,
    currentContent,
    proposedContent,
    hasChanges: proposedContent !== currentContent,
  };
}

/** The only function in this module that writes to disk — called strictly after explicit user approval. */
export function applyProposal(gitignorePath: string, proposedContent: string): void {
  fs.writeFileSync(gitignorePath, proposedContent, "utf8");
}

/** Secret-file detection needs `git ls-files`; outside a repo there's nothing to check, not an error. */
function safeFindSecretShapedFiles(repoRoot: string): SecretFileFinding[] {
  try {
    return findSecretShapedFiles(repoRoot);
  } catch {
    return [];
  }
}
