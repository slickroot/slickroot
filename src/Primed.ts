import type { Session } from "./Session.ts";

export class Primed implements Session {
  readonly #session: Session;
  readonly #prefix: string;
  #sent = false;

  private constructor(session: Session, prefix: string) {
    this.#session = session;
    this.#prefix = prefix;
  }

  static with(session: Session, prefix: string): Session {
    return new Primed(session, prefix);
  }

  async send(message: string): Promise<string> {
    const text = this.#sent ? message : `${this.#prefix}\n\n${message}`;
    this.#sent = true;
    return this.#session.send(text);
  }
}
