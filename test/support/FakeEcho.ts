import type { Echo } from "../../src/TerminalEcho.ts";

export class FakeEcho implements Echo {
  readonly writes: string[] = [];

  write(text: string): void {
    this.writes.push(text);
  }

  dim(text: string): string {
    return `<dim>${text}</dim>`;
  }
}