import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { GoalFile } from "./GoalFile.ts";

const run = promisify(execFile);

export async function repoName(cwd: string): Promise<string> {
  return basename(await git(cwd, "rev-parse", "--show-toplevel"));
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd });
  return stdout.trim();
}

export const requiredBranch = "main";

export type PreflightOutcome =
  | { kind: "ready"; repo: string; goal: string; standInPrompt: string; specsDir: string }
  | { kind: "noGoal" };

export class PreflightError extends Error {
  override name = "PreflightError";
}

export class Preflight {
  readonly #cwd: string;
  readonly #configDir: string;

  private constructor(cwd: string, configDir: string) {
    this.#cwd = cwd;
    this.#configDir = configDir;
  }

  static for(cwd: string, configDir: string): Preflight {
    return new Preflight(cwd, configDir);
  }

  async run(): Promise<PreflightOutcome> {
    const toplevel = await this.#git("rev-parse", "--show-toplevel");
    if (toplevel === undefined) throw new PreflightError(`not inside a git repo: ${this.#cwd}`);

    const branch = await this.#git("symbolic-ref", "--quiet", "--short", "HEAD");
    if (branch !== requiredBranch) {
      throw new PreflightError(`HEAD must be on ${requiredBranch}, not ${branch ?? "a detached HEAD"}`);
    }

    const specsDir = join(this.#cwd, "docs", "specs");
    if (!existsSync(specsDir)) throw new PreflightError(`missing ${specsDir}`);

    const standInPath = join(this.#configDir, "stand-in.md");
    if (!existsSync(standInPath)) throw new PreflightError(`missing ${standInPath}`);

    const repo = basename(toplevel);
    const goal = GoalFile.for(this.#configDir, repo).read();
    if (!goal) return { kind: "noGoal" };

    return { kind: "ready", repo, goal, standInPrompt: readFileSync(standInPath, "utf8"), specsDir };
  }

  async #git(...args: string[]): Promise<string | undefined> {
    try {
      return await git(this.#cwd, ...args);
    } catch {
      return undefined;
    }
  }
}
