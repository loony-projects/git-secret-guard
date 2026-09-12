import { execFileSync } from "child_process";

export class NotAGitRepoError extends Error {}

/** Thin sync wrapper around `git <args>` in a given cwd. Never touches history or writes anything. */
export function execGit(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not a git repository/i.test(message)) {
      throw new NotAGitRepoError(`${cwd} is not inside a git repository`);
    }
    throw err;
  }
}
