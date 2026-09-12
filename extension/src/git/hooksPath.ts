import * as path from "path";
import { execGit } from "./execGit";

/**
 * The effective hooks directory for the repo at `repoRoot`, honoring
 * `core.hooksPath` when set (relative paths are resolved against the repo
 * root, matching git's own behavior) and working correctly for worktrees
 * and submodules — `git rev-parse --git-path hooks` already accounts for
 * all of that, so we ask git rather than re-deriving it ourselves.
 */
export function resolveHooksDir(repoRoot: string): string {
  const gitPathHooks = execGit(repoRoot, ["rev-parse", "--git-path", "hooks"]);
  return path.isAbsolute(gitPathHooks) ? gitPathHooks : path.join(repoRoot, gitPathHooks);
}

/** The `.git` directory itself (accounting for worktrees/submodules), where the post-commit hook writes its alert file. */
export function resolveGitDir(repoRoot: string): string {
  const gitDir = execGit(repoRoot, ["rev-parse", "--git-dir"]);
  return path.isAbsolute(gitDir) ? gitDir : path.join(repoRoot, gitDir);
}

/** True if the repo has a custom `core.hooksPath` (informational, for messaging only). */
export function hasCustomHooksPath(repoRoot: string): boolean {
  try {
    const value = execGit(repoRoot, ["config", "--get", "core.hooksPath"]);
    return value.trim().length > 0;
  } catch {
    return false;
  }
}
