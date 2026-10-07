import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Session } from "./Session.ts";

const run = promisify(execFile);

const executable = "claude";
const readOnlyTools = "Read Grep Glob";
export const standInModel = "claude-sonnet-5-5";
const maxBuffer = 64 * 1024 * 1024;

export class ClaudeSessionError extends Error {
  override name = "ClaudeSessionError";
}

export function questionerArgs(home: string): string[] {
  const newSpec = join(home, ".claude", "skills", "xp-stories", "scripts", "new-spec");
  return ["--allowedTools", `${readOnlyTools} Bash(${newSpec}:*) Bash(scripts/new-spec:*)`];
}

export function standInSystemPrompt(standInPrompt: string, goal: string): string {
  return `${standInPrompt}\n\n## Goal\n\n${goal}`;
}

export function standInArgs(standInPrompt: string, goal: string): string[] {
  return [
    "--model",
    standInModel,
    "--allowedTools",
    readOnlyTools,
    "--append-system-prompt",
    standInSystemPrompt(standInPrompt, goal),
  ];
}

export function designerArgs(relativeSpecPath: string): string[] {
  return ["--allowedTools", `${readOnlyTools} Edit(${relativeSpecPath})`];
}

export const designStandInPrompt = `You are the project's architect. You're in a design discussion with a colleague about a user story. Together you are deciding its technical design, which developers will then implement from the spec. Your part is the thinking: the decisions and the reasons for them. Your colleague writes the design into the spec, and the developers write the code, so you have nothing to write or edit yourself.

Before you answer, read the spec and the code. Follow the direction the code already takes: its structure, naming and idioms. Aim for readable code and a clean architecture: components with clear responsibilities, simple dependencies, and nothing beyond what the story needs.

Treat it as a real discussion. The options you're offered are a starting point; if none of them is good enough, say so and propose a better one. Push back when something seems off, and ask a question back when you need one answered before you can decide.`;

export function designStandInArgs(): string[] {
  return ["--model", standInModel, "--allowedTools", readOnlyTools, "--append-system-prompt", designStandInPrompt];
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

  static designer(relativeSpecPath: string): ClaudeSession {
    return new ClaudeSession(designerArgs(relativeSpecPath));
  }

  static designStandIn(): ClaudeSession {
    return new ClaudeSession(designStandInArgs());
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
