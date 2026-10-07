import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import { requiredBranch } from "./Preflight.ts";

const run = promisify(execFile);

const remote = "origin";

export class SpecPublisherError extends Error {
  override name = "SpecPublisherError";
}

export class SpecPublisher {
  readonly #cwd: string;

  private constructor(cwd: string) {
    this.#cwd = cwd;
  }

  static in(cwd: string): SpecPublisher {
    return new SpecPublisher(cwd);
  }

  async publish(relativeSpecPath: string): Promise<void> {
    await this.#git("add", "--", relativeSpecPath);
    await this.#git("commit", "-q", "-m", `Add spec ${basename(relativeSpecPath, ".md")}`, "--", relativeSpecPath);
    await this.#git("push", "-q", remote, requiredBranch);
  }

  async #git(...args: string[]): Promise<void> {
    try {
      await run("git", args, { cwd: this.#cwd });
    } catch (error) {
      throw new SpecPublisherError(`git ${args[0]} failed: ${(error as Error).message}`, { cause: error });
    }
  }
}
