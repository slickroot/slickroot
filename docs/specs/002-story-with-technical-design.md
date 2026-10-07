# The goal file turns into a story with its technical design

Maya has written a goal file for her project. In her terminal, inside the project's repo, she runs one command. She answers no questions, and a new spec file appears holding the next story toward her goal, with its technical design already filled in. Happy, she goes to grab a coffee.

## Acceptance Criteria

- Once the story is written, the same run goes on to fill in the spec's technical design. Maya runs no second command.
- The `/xp-tech-design` skill is used on the new spec to produce the design.
- No questions are asked of Maya during the design conversation. The stand-in does the answering.
- The design conversation starts fresh for both sides. Neither the Questioner nor the stand-in remembers the story conversation.
- When the run succeeds, the spec's path is printed as it is today, and the spec's `## Technical Design` section is filled in.
- If the design conversation fails, the run fails: nothing is printed and the exit code is non-zero. The spec stays in the project with its story and an empty `## Technical Design` section.
- Each run writes two transcripts to `runs/`: `stories-<timestamp>.md` for the story conversation and `tech-design-<timestamp>.md` for the design conversation.

## Technical Design

After the story conversation writes the spec, a second conversation runs in the same process. A fresh **Questioner** runs `/xp-tech-design` on the new spec, and a fresh **StandIn** answers. slickroot passes messages between them until the spec's `## Technical Design` section has content. Both new sessions start with no `--resume`, so neither one remembers the story conversation.

### Components

**`Conversation`** becomes the generic turn loop. It no longer knows about stories. `Conversation.between({ questioner, standIn, transcript, stderr, label, firstMessage, finished })` with `finished: () => boolean`, and `run(): Promise<void>`:
1. Record `slickroot` → `firstMessage`, then send it to the Questioner.
2. After each Questioner reply, record it, then call `finished()`:
   - `true`: done, return;
   - `false`: send the reply to the StandIn, record the answer, send it to the Questioner, and repeat.
3. Throw `ConversationError` (`<label>: not finished within 30 turns`) once `maxTurns` (30) is exceeded.

Each turn writes `<label> turn n/30…` to stderr. Each conversation counts its own 30 turns.

**`StoryConversation`** wraps `Conversation` and holds the story-specific steps that used to be in `Conversation`. It collaborates with the Questioner, the StandIn, `SpecDirectory`, the transcript and stderr. `run(): Promise<string>`:
1. Send the opener `What should the next user story be about? Answer in one sentence.` to the StandIn, recording both. The `opener` export moves here.
2. Run the loop with label `story`, first message `/xp-stories <topic>`, and a `finished` that checks `specs.newFiles()`: one file finishes the conversation and its path is kept, more than one throws `ConversationError`, and none continues the loop.
3. Return the kept path.

**`DesignConversation`** wraps `Conversation`. It collaborates with the design Questioner, the design StandIn, a `SpecFile`, the design transcript and stderr. It knows the spec's cwd-relative path. `run(): Promise<void>` runs the loop with label `design`, first message `/xp-tech-design <relative spec path>`, and `finished = () => specFile.hasTechnicalDesign()`. The StandIn gets no opener.

**`SpecFile`** (new) knows one spec's path. `SpecFile.at(path)`. `hasTechnicalDesign(): boolean` reads the file fresh on every call:
- It finds the line that is exactly `## Technical Design`.
- It takes the text after it, up to the next line starting with `## ` (level 2 only, so `###` subsections count as content) or the end of the file.
- It returns `true` if that text, trimmed, isn't empty.
- A missing header returns `false` and does not throw. The loop continues and `maxTurns` eventually fails the run.

**`ClaudeSession`** gets two new factories. The existing `questioner` and `standIn` are unchanged.
- `ClaudeSession.designer(relativeSpecPath)` with `designerArgs(relativeSpecPath)` = `--allowedTools "Read Grep Glob Edit(<relative spec path>)"`. This is read-only exploration plus `Edit` scoped to that one spec: no `Write`, no `new-spec`, no Bash. The path is cwd-relative (for example `docs/specs/002-x.md`). In a permission rule `Edit(/…)` would be read as relative to the project root rather than absolute. slickroot always runs from the repo root, the same assumption `Preflight` makes for `docs/specs`.
- `ClaudeSession.designStandIn()` with `designStandInArgs()` = `--model claude-sonnet-5-5 --allowedTools "Read Grep Glob"`. There is **no** `--append-system-prompt`, so the design StandIn gets neither `stand-in.md` nor the goal. It answers from the code and the spec, which keeps the design to what this story needs.

**`Transcript`** gets a name prefix: `Transcript.forRun(configDir, repo, prefix, startedAt)` writes `<repo>/runs/<prefix>-<timestamp>.md`. `forRun` creates the file (empty) right away, so a transcript exists even for a conversation that never started.

**`bin/slickroot.ts`** wiring:
1. Preflight, as today.
2. Take one `startedAt = new Date()`, then create `Transcript.forRun(…, "stories", startedAt)` and `Transcript.forRun(…, "tech-design", startedAt)`. Both files now exist and share a timestamp.
3. Record the `StandIn system prompt` entry in the stories transcript, as today.
4. `specPath = await StoryConversation…run()`.
5. `relativeSpecPath = relative(process.cwd(), specPath)`.
6. `await DesignConversation…run()` with `ClaudeSession.designer(relativeSpecPath)`, `ClaudeSession.designStandIn()` and `SpecFile.at(specPath)`.
7. Print `specPath` to stdout, as today. Nothing is printed until the design has finished.

### Files outside the repo

| Path | Purpose |
|---|---|
| `<repo>/runs/stories-<timestamp>.md` | Story conversation transcript. It starts with the `StandIn system prompt` entry. |
| `<repo>/runs/tech-design-<timestamp>.md` | Design conversation transcript. It starts with `slickroot` → `/xp-tech-design <path>`. It always exists, and is empty if the story conversation failed. |

The single `<repo>/runs/<timestamp>.md` is gone.

### Exit codes

| Outcome | Exit | stdout |
|---|---|---|
| Spec written and Technical Design filled | 0 | spec path |
| No goal file for this repo | 0 | nothing |
| Preflight error, `claude` error, either conversation over `maxTurns`, or ≠1 new spec | non-zero | nothing (message on stderr) |

If the design conversation fails, the spec stays on disk with its story and an empty `## Technical Design`. slickroot does not delete or roll back anything.

### Tests

- **Unit:**
  - `Conversation` with `FakeSession`s and a stub `finished` covers the first message, stopping when `finished()` is true, `maxTurns`, turn order, and the label in the stderr lines.
  - `StoryConversation` covers the opener, `/xp-stories <topic>`, stopping on the first new file, and failing on more than one new file.
  - `DesignConversation` covers `/xp-tech-design <path>` as the first message, no opener to the StandIn, and stopping once the spec gains a Technical Design.
  - `SpecFile` against temp files covers an empty section, whitespace only, content, `###` subsections, a following `##` section, and a missing header.
  - `designerArgs` / `designStandInArgs` cover the scoped `Edit(...)` rule and the absence of `--append-system-prompt`.
  - `Transcript` covers the prefixed name and that the file is created when constructed.
- **Acceptance:** the same approach as spec 001: the real `bin/slickroot.ts` in a temp repo, with a fake `claude` on `PATH` that logs its argv and returns canned JSON. The fake also handles the design sessions, and on the design Questioner's final turn it fills in `## Technical Design` in the spec. The tests assert the following:
  - The printed path's spec has a non-empty Technical Design.
  - `stories-<ts>.md` and `tech-design-<ts>.md` exist with matching timestamps.
  - The design calls start without `--resume` and never get the goal.
  - In a failure test, a design error gives a non-zero exit and empty stdout, and leaves the spec with its story and an empty `## Technical Design`.
