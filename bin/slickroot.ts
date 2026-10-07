#!/usr/bin/env node
import { homedir } from "node:os";
import { ClaudeSession, standInSystemPrompt } from "../src/ClaudeSession.ts";
import { slickrootConfigDir } from "../src/configDir.ts";
import { StoryConversation } from "../src/StoryConversation.ts";
import { Preflight } from "../src/Preflight.ts";
import { SpecDirectory } from "../src/SpecDirectory.ts";
import { Transcript } from "../src/Transcript.ts";

const stderr = (text: string) => process.stderr.write(text);

try {
  const home = homedir();
  const configDir = slickrootConfigDir(process.env, home);
  const outcome = await Preflight.for(process.cwd(), configDir).run();
  if (outcome.kind === "ready") {
    const specs = SpecDirectory.snapshot(outcome.specsDir);
    const transcript = Transcript.forRun(configDir, outcome.repo, "stories", new Date());
    transcript.append("StandIn system prompt", standInSystemPrompt(outcome.standInPrompt, outcome.goal));
    const specPath = await StoryConversation.between({
      questioner: ClaudeSession.questioner(home),
      standIn: ClaudeSession.standIn(outcome.standInPrompt, outcome.goal),
      specs,
      transcript,
      stderr,
    }).run();
    process.stdout.write(`${specPath}\n`);
  }
} catch (error) {
  stderr(`slickroot: ${(error as Error).message}\n`);
  process.exitCode = 1;
}
