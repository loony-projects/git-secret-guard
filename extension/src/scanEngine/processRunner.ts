import { spawn } from "child_process";

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type ProcessRunner = (
  command: string,
  args: string[],
  options: { cwd?: string; input?: string },
) => Promise<ProcessResult>;

/** Real implementation, used everywhere outside of unit tests. */
export const spawnProcessRunner: ProcessRunner = (command, args, options) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });

    if (options.input !== undefined) {
      child.stdin.write(options.input, "utf8");
    }
    child.stdin.end();
  });
};
