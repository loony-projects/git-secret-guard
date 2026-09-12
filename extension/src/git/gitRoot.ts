import { execGit } from "./execGit";

/** The top-level working-tree directory for the repo containing `cwd`, or undefined if not a git repo. */
export function findGitRoot(cwd: string): string | undefined {
  try {
    return execGit(cwd, ["rev-parse", "--show-toplevel"]);
  } catch {
    return undefined;
  }
}
