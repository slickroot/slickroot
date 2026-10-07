import { Conversation, ConversationError } from "./Conversation.ts";
import type { Session } from "./Session.ts";
import type { SpecDirectory } from "./SpecDirectory.ts";
import type { Transcript } from "./Transcript.ts";

export const opener = "What should the next user story be about? Answer in one sentence.";

const skill = "/xp-stories";

export type StoryParticipants = {
  questioner: Session;
  standIn: Session;
  specs: SpecDirectory;
  transcript: Transcript;
  stderr: (text: string) => void;
};

export class StoryConversation {
  readonly #participants: StoryParticipants;

  private constructor(participants: StoryParticipants) {
    this.#participants = participants;
  }

  static between(participants: StoryParticipants): StoryConversation {
    return new StoryConversation(participants);
  }

  async run(): Promise<string> {
    const { questioner, standIn, specs, transcript, stderr } = this.#participants;
    transcript.append("slickroot", opener);
    const topic = await standIn.send(opener);
    transcript.append("StandIn", topic);

    let specPath: string | undefined;
    await Conversation.between({
      questioner,
      standIn,
      transcript,
      stderr,
      label: "story",
      firstMessage: `${skill} ${topic}`,
      finished: () => {
        const newFiles = specs.newFiles();
        if (newFiles.length > 1) {
          throw new ConversationError(`expected one new spec, found ${newFiles.length}: ${newFiles.join(", ")}`);
        }
        specPath = newFiles[0];
        return specPath !== undefined;
      },
    }).run();
    return specPath!;
  }
}
