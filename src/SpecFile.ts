import { readFileSync } from "node:fs";

const technicalDesignHeader = "## Technical Design";
const levelTwoPrefix = "## ";

export class SpecFile {
  readonly #path: string;

  private constructor(path: string) {
    this.#path = path;
  }

  static at(path: string): SpecFile {
    return new SpecFile(path);
  }

  hasTechnicalDesign(): boolean {
    const lines = readFileSync(this.#path, "utf8").split("\n");
    const headerIndex = lines.findIndex((line) => line.trimEnd() === technicalDesignHeader);
    if (headerIndex === -1) return false;
    const following = lines.slice(headerIndex + 1);
    const sectionEnd = following.findIndex((line) => line.startsWith(levelTwoPrefix));
    const section = sectionEnd === -1 ? following : following.slice(0, sectionEnd);
    return section.join("\n").trim() !== "";
  }
}
