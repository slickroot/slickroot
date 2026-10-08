#!/usr/bin/env node
import { homedir } from "node:os";
import { relative, resolve } from "node:path";
import { ClaudeSession, standInSystemPrompt } from "../src/ClaudeSession.ts";
import { slickrootConfigDir } from "../src/configDir.ts";
import { bareName, ConversationCommand } from "../src/ConversationCommand.ts";
import { Conversation } from "../src/Conversation.ts";
import { DesignConversation } from "../src/DesignConversation.ts";
import { StoryConversation } from "../src/StoryConversation.ts";
import { GoalProgress } from "../src/goalProgress/GoalProgress.ts";
import { Implementer } from "../src/Implementer.ts";
import { LiveSink } from "../src/LiveSink.ts";
import { Preflight, repoName } from "../src/Preflight.ts";
import { Primed } from "../src/Primed.ts";
import { SpecDirectory } from "../src/SpecDirectory.ts";
import { SpecFile } from "../src/SpecFile.ts";
import { SpecPublisher } from "../src/SpecPublisher.ts";
import { TerminalEcho } from "../src/TerminalEcho.ts";
import { Transcript } from "../src/Transcript.ts";
import { WatchedPath } from "../src/WatchedPath.ts";

const stderr = (text: string) => process.stderr.write(text);

const [command, specFile] = process.argv.slice(2);

try {
  const home = homedir();
  const configDir = slickrootConfigDir(process.env, home);
  if (command === "goal-keeper") {
    if (specFile === undefined) throw new Error("goal-keeper needs a spec file");
    await GoalProgress.afterRun({
      configDir,
      repo: await repoName(process.cwd()),
      specPath: resolve(process.cwd(), specFile),
      startedAt: new Date(),
      echo: TerminalEcho.for(process.stderr),
      stderr,
    });
  } else if (command === "conversation") {
    const { leadSkill, ownerSkill, until, seed } = ConversationCommand.parse(process.argv.slice(3));
    const echo = TerminalEcho.for(process.stderr);
    const finished = WatchedPath.at(until);
    await Conversation.between({
      questioner: ClaudeSession.lead(),
      standIn: Primed.with(ClaudeSession.owner(), `${ownerSkill} ${seed}`),
      transcript: LiveSink.for(echo, "Lead"),
      stderr,
      label: bareName(leadSkill),
      labels: { questioner: "Lead", standIn: "Owner" },
      firstMessage: `${leadSkill} ${seed}`,
      finished: () => finished.changed(),
    }).run();
  } else if (command !== undefined) {
    throw new Error(`unknown command: ${command}`);
  } else {
    const outcome = await Preflight.for(process.cwd(), configDir).run();
    if (outcome.kind === "ready") {
      const specs = SpecDirectory.snapshot(outcome.specsDir);
      const startedAt = new Date();
      const echo = TerminalEcho.for(process.stderr);
      const storiesTranscript = Transcript.forRun(configDir, outcome.repo, "stories", startedAt, echo);
      const designTranscript = Transcript.forRun(configDir, outcome.repo, "tech-design", startedAt, echo);
      storiesTranscript.append("StandIn system prompt", standInSystemPrompt(outcome.standInPrompt, outcome.goal));
      const specPath = await StoryConversation.between({
        questioner: ClaudeSession.questioner(home),
        standIn: ClaudeSession.standIn(outcome.standInPrompt, outcome.goal),
        specs,
        transcript: storiesTranscript,
        stderr,
      }).run();
      const relativeSpecPath = relative(process.cwd(), specPath);
      await DesignConversation.between({
        questioner: ClaudeSession.designer(relativeSpecPath),
        standIn: ClaudeSession.designStandIn(),
        specFile: SpecFile.at(specPath),
        relativeSpecPath,
        transcript: designTranscript,
        stderr,
      }).run();
      await SpecPublisher.in(process.cwd()).publish(relativeSpecPath);
      await Implementer.for(echo).implement(relativeSpecPath);
      await GoalProgress.afterRun({ configDir, repo: outcome.repo, specPath, startedAt, echo, stderr });
    }
  }
} catch (error) {
  stderr(`slickroot: ${(error as Error).message}\n`);
  process.exitCode = 1;
}
