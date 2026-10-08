import type { Sink } from "./Transcript.ts";
import type { Echo } from "./TerminalEcho.ts";

export class LiveSink implements Sink {
  readonly #echo: Echo;
  readonly #leadLabel: string;

  private constructor(echo: Echo, leadLabel: string) {
    this.#echo = echo;
    this.#leadLabel = leadLabel;
  }

  static for(echo: Echo, leadLabel: string): LiveSink {
    return new LiveSink(echo, leadLabel);
  }

  append(speaker: string, text: string): void {
    const block = `## ${speaker}\n\n${text}\n\n`;
    this.#echo.write(speaker === this.#leadLabel ? this.#echo.dim(block) : block);
  }
}
