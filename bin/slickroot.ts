#!/usr/bin/env node
import { homedir } from "node:os";
import { relative } from "node:path";
import { ClaudeSession, standInSystemPrompt } from "../src/ClaudeSession.ts";
import { slickrootConfigDir } from "../src/configDir.ts";
import { DesignConversation } from "../src/DesignConversation.ts";
import { StoryConversation } from "../src/StoryConversation.ts";
import { Implementer } from "../src/Implementer.ts";
import { Preflight } from "../src/Preflight.ts";
import { SpecDirectory } from "../src/SpecDirectory.ts";
import { SpecFile } from "../src/SpecFile.ts";
import { SpecPublisher } from "../src/SpecPublisher.ts";
import { TerminalEcho } from "../src/TerminalEcho.ts";
import { Transcript } from "../src/Transcript.ts";

const stderr = (text: string) => process.stderr.write(text);

try {
  const home = homedir();
  const configDir = slickrootConfigDir(process.env, home);
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
  }
} catch (error) {
  stderr(`slickroot: ${(error as Error).message}\n`);
  process.exitCode = 1;
}
