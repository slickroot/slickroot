import { readdirSync } from "node:fs";
import { join } from "node:path";

export class SpecDirectory {
  readonly #path: string;
  readonly #namesBeforeRun: ReadonlySet<string>;

  private constructor(path: string, namesBeforeRun: ReadonlySet<string>) {
    this.#path = path;
    this.#namesBeforeRun = namesBeforeRun;
  }

  static snapshot(path: string): SpecDirectory {
    return new SpecDirectory(path, new Set(readdirSync(path)));
  }

  newFiles(): string[] {
    return readdirSync(this.#path)
      .filter((name) => !this.#namesBeforeRun.has(name))
      .map((name) => join(this.#path, name));
  }
}
