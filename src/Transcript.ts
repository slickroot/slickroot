import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export class Transcript {
  readonly path: string;

  private constructor(path: string) {
    this.path = path;
  }

  static forRun(configDir: string, repo: string, startedAt: Date): Transcript {
    const timestamp = startedAt.toISOString().replaceAll(":", "-");
    return new Transcript(join(configDir, repo, "runs", `${timestamp}.md`));
  }

  append(speaker: string, text: string): void {
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `## ${speaker}\n\n${text}\n\n`);
  }
}
