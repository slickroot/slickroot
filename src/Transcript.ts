import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export class Transcript {
  readonly path: string;

  private constructor(path: string) {
    this.path = path;
  }

  static forRun(configDir: string, repo: string, prefix: string, startedAt: Date): Transcript {
    const timestamp = startedAt.toISOString().replaceAll(":", "-");
    const path = join(configDir, repo, "runs", `${prefix}-${timestamp}.md`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "");
    return new Transcript(path);
  }

  append(speaker: string, text: string): void {
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `## ${speaker}\n\n${text}\n\n`);
  }
}
