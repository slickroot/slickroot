import { Conversation } from "./Conversation.ts";
import type { Session } from "./Session.ts";
import type { SpecFile } from "./SpecFile.ts";
import type { Transcript } from "./Transcript.ts";

const skill = "/xp-tech-design";

export type DesignParticipants = {
  questioner: Session;
  standIn: Session;
  specFile: SpecFile;
  relativeSpecPath: string;
  transcript: Transcript;
  stderr: (text: string) => void;
};

export class DesignConversation {
  readonly #participants: DesignParticipants;

  private constructor(participants: DesignParticipants) {
    this.#participants = participants;
  }

  static between(participants: DesignParticipants): DesignConversation {
    return new DesignConversation(participants);
  }

  async run(): Promise<void> {
    const { questioner, standIn, specFile, relativeSpecPath, transcript, stderr } = this.#participants;
    await Conversation.between({
      questioner,
      standIn,
      transcript,
      stderr,
      label: "design",
      firstMessage: `${skill} ${relativeSpecPath}`,
      finished: () => specFile.hasTechnicalDesign(),
    }).run();
  }
}
