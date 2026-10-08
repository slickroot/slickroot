import type { Session } from "./Session.ts";
import type { Sink } from "./Transcript.ts";

export const maxTurns = 30;

export class ConversationError extends Error {
  override name = "ConversationError";
}

export type SpeakerLabels = {
  questioner: string;
  standIn: string;
};

export const defaultLabels: SpeakerLabels = {
  questioner: "Questioner",
  standIn: "StandIn",
};

export type Participants = {
  questioner: Session;
  standIn: Session;
  transcript: Sink;
  stderr: (text: string) => void;
  label: string;
  firstMessage: string;
  finished: () => boolean;
  labels?: SpeakerLabels;
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
    const labels = this.#participants.labels ?? defaultLabels;
    transcript.append("slickroot", firstMessage);

    let message = firstMessage;
    for (let turn = 1; turn <= maxTurns; turn++) {
      stderr(`${label} turn ${turn}/${maxTurns}…\n`);
      const reply = await questioner.send(message);
      transcript.append(labels.questioner, reply);
      if (finished()) return;
      if (turn === maxTurns) break;

      message = await standIn.send(reply);
      transcript.append(labels.standIn, message);
    }
    throw new ConversationError(`${label}: not finished within ${maxTurns} turns`);
  }
}
