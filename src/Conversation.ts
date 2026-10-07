import type { Session } from "./Session.ts";
import type { Transcript } from "./Transcript.ts";

export const maxTurns = 30;

export class ConversationError extends Error {
  override name = "ConversationError";
}

export type Participants = {
  questioner: Session;
  standIn: Session;
  transcript: Transcript;
  stderr: (text: string) => void;
  label: string;
  firstMessage: string;
  finished: () => boolean;
};

export class Conversation {
  readonly #participants: Participants;

  private constructor(participants: Participants) {
    this.#participants = participants;
  }

  static between(participants: Participants): Conversation {
    return new Conversation(participants);
  }

  async run(): Promise<void> {
    const { questioner, standIn, transcript, stderr, label, firstMessage, finished } = this.#participants;
    transcript.append("slickroot", firstMessage);

    let message = firstMessage;
    for (let turn = 1; turn <= maxTurns; turn++) {
      stderr(`${label} turn ${turn}/${maxTurns}…\n`);
      const reply = await questioner.send(message);
      transcript.append("Questioner", reply);
      if (finished()) return;
      if (turn === maxTurns) break;

      message = await standIn.send(reply);
      transcript.append("StandIn", message);
    }
    throw new ConversationError(`${label}: not finished within ${maxTurns} turns`);
  }
}
