import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ClaudeSession, standInModel } from "../ClaudeSession.ts";
import { GoalFile } from "../GoalFile.ts";
import type { Session } from "../Session.ts";
import type { Echo } from "../TerminalEcho.ts";
import { Transcript } from "../Transcript.ts";
import { GoalDocument } from "./GoalDocument.ts";
import { GoalKeeper } from "./GoalKeeper.ts";

export type GoalProgressContext = {
  configDir: string;
  repo: string;
  specPath: string;
  startedAt: Date;
  echo: Echo;
  stderr: (text: string) => void;
  newSession?: () => Session;
};

const keeperConfigFile = "goal-keeper.md";

export class GoalProgress {
  static async afterRun(context: GoalProgressContext): Promise<void> {
    try {
      await update(context);
    } catch (error) {
      context.stderr(`slickroot: goal progress not recorded: ${(error as Error).message}`);
    }
  }
}

async function update(context: GoalProgressContext): Promise<void> {
  const roleText = readRoleText(context.configDir);
  if (roleText === undefined) return;

  const goalFile = GoalFile.for(context.configDir, context.repo);
  const content = goalFile.read();
  if (content === undefined) throw new Error(`no goal file at ${goalFile.path}`);

  const document = GoalDocument.parse(content);
  const specText = readFileSync(context.specPath, "utf8");
  const transcript = Transcript.forRun(context.configDir, context.repo, "goal", context.startedAt, context.echo);

  const newSession = context.newSession ?? ((): Session => ClaudeSession.withArgs(["--model", standInModel]));
  const verdicts = await GoalKeeper.for(newSession(), transcript, roleText).classify(document, specText);

  goalFile.write(document.render(verdicts));
}

function readRoleText(configDir: string): string | undefined {
  const path = join(configDir, keeperConfigFile);
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}