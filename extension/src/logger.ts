import { OUTPUT_CHANNEL_NAME } from "./constants";

/**
 * Minimal shape of vscode.OutputChannel this module depends on, so unit
 * tests can inject a plain in-memory sink instead of pulling in the real
 * `vscode` module (which only exists inside the extension host).
 */
export interface OutputSink {
  appendLine(value: string): void;
  show(): void;
  dispose(): void;
}

/**
 * Thin wrapper around an output channel. This is the ONLY place allowed to
 * write to the channel. It never accepts a raw secret value — callers must
 * already have redacted anything secret-shaped (see redact.ts) before
 * calling info/warn/error/debug. There is no "log the finding" convenience
 * method here on purpose: that would invite a raw string to slip through.
 */
export class Logger {
  constructor(private readonly channel: OutputSink) {}

  info(message: string): void {
    this.channel.appendLine(`[INFO] ${message}`);
  }

  warn(message: string): void {
    this.channel.appendLine(`[WARN] ${message}`);
  }

  error(message: string): void {
    this.channel.appendLine(`[ERROR] ${message}`);
  }

  debug(message: string): void {
    this.channel.appendLine(`[DEBUG] ${message}`);
  }

  show(): void {
    this.channel.show();
  }

  dispose(): void {
    this.channel.dispose();
  }
}

export function createVscodeLogger(): Logger {
  // Lazily required so plain mocha unit tests (run outside the extension
  // host) never need the real `vscode` module to import this file.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const vscode = require("vscode");
  const channel: OutputSink = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  return new Logger(channel);
}
