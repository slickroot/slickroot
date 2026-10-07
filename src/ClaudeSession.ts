import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Session } from "./Session.ts";

const run = promisify(execFile);

const executable = "claude";
const readOnlyTools = "Read Grep Glob";
const maxBuffer = 64 * 1024 * 1024;

export class ClaudeSessionError extends Error {
  override name = "ClaudeSessionError";
}

export function questionerArgs(home: string): string[] {
  const newSpec = join(home, ".claude", "skills", "xp-stories", "scripts", "new-spec");
  return ["--allowedTools", `${readOnlyTools} Bash(${newSpec}:*)`];
}

export function standInArgs(standInPrompt: string, goal: string): string[] {
  return ["--allowedTools", readOnlyTools, "--append-system-prompt", `${standInPrompt}\n\n## Goal\n\n${goal}`];
}

export class ClaudeSession implements Session {
  readonly #args: readonly string[];
  #sessionId: string | undefined;

  private constructor(args: readonly string[]) {
    this.#args = args;
  }

  static withArgs(args: readonly string[]): ClaudeSession {
    return new ClaudeSession(args);
  }

  static questioner(home: string): ClaudeSession {
    return new ClaudeSession(questionerArgs(home));
  }

  static standIn(standInPrompt: string, goal: string): ClaudeSession {
    return new ClaudeSession(standInArgs(standInPrompt, goal));
  }

  async send(message: string): Promise<string> {
    const args = ["-p", message, "--output-format", "json", ...this.#args];
    if (this.#sessionId !== undefined) args.push("--resume", this.#sessionId);

    let stdout: string;
    try {
      ({ stdout } = await run(executable, args, { maxBuffer }));
    } catch (error) {
      throw new ClaudeSessionError(`${executable} failed: ${(error as Error).message}`, { cause: error });
    }

    const reply = JSON.parse(stdout) as Reply;
    if (reply.is_error) throw new ClaudeSessionError(`${executable} returned an error: ${reply.result}`);
    this.#sessionId = reply.session_id;
    return reply.result;
  }
}

type Reply = { session_id: string; result: string; is_error?: boolean };
