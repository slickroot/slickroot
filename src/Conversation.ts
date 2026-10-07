import type { Session } from "./Session.ts";
import type { SpecDirectory } from "./SpecDirectory.ts";
import type { Transcript } from "./Transcript.ts";

export const maxTurns = 30;

export const opener = "What should the next user story be about? Answer in one sentence.";

const skill = "/xp-stories";

export class ConversationError extends Error {
  override name = "ConversationError";
}

export type Participants = {
  questioner: Session;
  standIn: Session;
  specs: SpecDirectory;
  transcript: Transcript;
  stderr: (text: string) => void;
};

export class Conversation {
  readonly #participants: Participants;

  private constructor(participants: Participants) {
    this.#participants = participants;
  }

  static between(participants: Participants): Conversation {
    return new Conversation(participants);
  }

  async run(): Promise<string> {
    const { questioner, standIn, specs, transcript, stderr } = this.#participants;
    transcript.append("slickroot", opener);
    const topic = await standIn.send(opener);
    transcript.append("StandIn", topic);

    let message = `${skill} ${topic}`;
    for (let turn = 1; turn <= maxTurns; turn++) {
      stderr(`turn ${turn}/${maxTurns}…\n`);
      const question = await questioner.send(message);
      transcript.append("Questioner", question);

      const newFiles = specs.newFiles();
      if (newFiles.length === 1) return newFiles[0]!;
      if (newFiles.length > 1) throw new ConversationError(`expected one new spec, found ${newFiles.length}: ${newFiles.join(", ")}`);
      if (turn === maxTurns) break;

      message = await standIn.send(question);
      transcript.append("StandIn", message);
    }
    throw new ConversationError(`no spec written within ${maxTurns} turns`);
  }
}
