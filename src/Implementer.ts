import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { standInModel } from "./ClaudeSession.ts";
import type { Echo } from "./TerminalEcho.ts";

export const skill = "/xp-implement";
const executable = "claude";

export class ImplementerError extends Error {
  override name = "ImplementerError";
}

export class Implementer {
  readonly #echo: Echo;

  private constructor(echo: Echo) {
    this.#echo = echo;
  }

  static for(echo: Echo): Implementer {
    return new Implementer(echo);
  }

  async implement(relativeSpecPath: string): Promise<void> {
    const args = ["-p", `${skill} ${relativeSpecPath}`, "--model", standInModel, "--output-format", "stream-json", "--verbose"];
    const child = spawn(executable, args, { stdio: ["ignore", "pipe", "inherit"] });
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });

    let errorResult: string | undefined;
    for await (const line of createInterface({ input: child.stdout })) {
      const event = JSON.parse(line) as StreamEvent;
      if (event.type === "assistant") this.#echo.write(textOf(event));
      if (event.type === "result" && event.is_error) errorResult = event.result ?? "";
    }

    let code: number | null;
    try {
      code = await exited;
    } catch (error) {
      throw new ImplementerError(`${executable} failed: ${(error as Error).message}`, { cause: error });
    }
    if (code !== 0) throw new ImplementerError(`${executable} exited with code ${code}`);
    if (errorResult !== undefined) throw new ImplementerError(`${executable} returned an error: ${errorResult}`);
  }
}

function textOf(event: StreamEvent): string {
  return (event.message?.content ?? []).flatMap((block) => (block.type === "text" ? [`${block.text}\n`] : [])).join("");
}

type StreamEvent = {
  type: string;
  message?: { content: { type: string; text?: string }[] };
  is_error?: boolean;
  result?: string;
};
