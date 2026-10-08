import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export class GoalFile {
  readonly path: string;

  private constructor(path: string) {
    this.path = path;
  }

  static for(configDir: string, repo: string): GoalFile {
    return new GoalFile(join(configDir, repo, "goal.md"));
  }

  read(): string | undefined {
    try {
      return readFileSync(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  write(content: string): void {
    writeFileSync(this.path, content);
  }
}
