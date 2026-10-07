import type { Session } from "../../src/Session.ts";

export type ScriptedTurn = { reply: string; before?: () => void };

export class FakeSession implements Session {
  readonly received: string[] = [];
  readonly #script: ScriptedTurn[];
  readonly #fallback: string;

  private constructor(script: ScriptedTurn[], fallback: string) {
    this.#script = script;
    this.#fallback = fallback;
  }

  static scripted(script: ScriptedTurn[], fallback = "..."): FakeSession {
    return new FakeSession(script, fallback);
  }

  static replying(reply: string): FakeSession {
    return new FakeSession([], reply);
  }

  async send(message: string): Promise<string> {
    const turn = this.#script[this.received.length];
    this.received.push(message);
    if (turn === undefined) return this.#fallback;
    turn.before?.();
    return turn.reply;
  }
}
