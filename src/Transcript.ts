import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Echo } from "./TerminalEcho.ts";

export interface Sink {
  append(speaker: string, text: string): void;
}

export class Transcript implements Sink {
  readonly path: string;
  readonly #echo: Echo;

  private constructor(path: string, echo: Echo) {
    this.path = path;
    this.#echo = echo;
  }

  static forRun(configDir: string, repo: string, prefix: string, startedAt: Date, echo: Echo): Transcript {
    const timestamp = startedAt.toISOString().replaceAll(":", "-");
    const path = join(configDir, repo, "runs", `${prefix}-${timestamp}.md`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "");
    return new Transcript(path, echo);
  }

  append(speaker: string, text: string): void {
    const block = `## ${speaker}\n\n${text}\n\n`;
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, block);
    this.#echo.write(speaker === "Questioner" ? this.#echo.dim(block) : block);
  }
}
