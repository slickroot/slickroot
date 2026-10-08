# Run one lead–owner conversation and watch it

Maya is tuning the owner side of her two conversations. Instead of running the whole pipeline, she runs a single conversation on its own: a **lead** skill and an **owner** skill, seeded with a topic or a spec. It scrolls in her terminal as it happens. She reads it, edits the owner skill, and runs it again — over and over until the owner behaves the way she wants. She never answers a question herself.

## Acceptance Criteria

- `slickroot conversation --lead <skill> --owner <skill> --until <path> <seed>` runs exactly one conversation and streams both sides to the terminal.
- Both sides are skills. The lead is primed with `/lead <seed>` and speaks first. The owner is primed with `/owner <seed>` in the same message as the lead's first question, so it needs no separate opening turn.
- The owner receives the seed.
- The conversation stops as soon as anything under `<path>` changes.
- The owner is read-only; the lead may read and write.
- No transcript file is written. The conversation only echoes to stderr.
- The two sides are labelled `Lead` and `Owner`, and the lead is dimmed, as the Questioner is dimmed today.
- The existing full run and its `StoryConversation` / `DesignConversation` wrappers are unchanged.

## Technical Design

`slickroot conversation` is the existing `Conversation` turn loop, wired by hand from the command line instead of by a wrapper. The command adds four small pieces around it: a lead/owner session pair, a decorator that folds the owner's skill invocation into its first message, an echo-only sink, and a watched-path stop condition. Nothing in the story/design path changes.

### Command line

`bin/slickroot.ts` takes an optional command. With no command it runs the full pipeline exactly as today. With `conversation` it parses:

```
slickroot conversation --lead <skill> --owner <skill> --until <path> <seed...>
```

- `--lead` and `--owner` are skill names (`/xp-stories`, `/xp-stories-owner`).
- `--until` is a file or directory to watch.
- `<seed...>` is every remaining argument joined with spaces. It is the topic for the story conversation or a spec reference (`@docs/specs/001-x.md`) for the design one; slickroot forwards it verbatim and does not interpret `@`.

A missing flag, or an empty seed, is a `slickroot:` error on stderr and a non-zero exit.

### Components

**`ClaudeSession`** gains two factories. The skill is not part of the session's args — it is sent as the first message by the loop — so the factories only fix the tools and the model:

- `ClaudeSession.lead()` → `--allowedTools "Read Grep Glob Edit Bash"`, default model.
- `ClaudeSession.owner()` → `--allowedTools "Read Grep Glob" --model <standInModel>`.

The existing `questioner`, `standIn`, `designer` and `designStandIn` factories stay for the full run.

**`Primed`** (new, `src/Primed.ts`) decorates a `Session`. `Primed.with(session, prefix)`: the first `send(message)` calls `session.send(`${prefix}\n\n${message}`)`; every later `send` passes straight through. This is how the owner's skill invocation (`/xp-tech-design-owner @docs/specs/001-x.md`) rides along with the lead's first question in one turn.

**`WatchedPath`** (new, `src/WatchedPath.ts`) is the stop condition. `WatchedPath.at(path)` records a snapshot of `path` at construction — for a directory, every file below it, as a relative path with its mtime and size; for a file, just that file. `changed(): boolean` re-walks the path and returns `true` if the snapshot differs. A new file, an edit or a delete all count. This is the whole of `finished`; it knows nothing about specs.

**`Sink`** (new interface in `src/Transcript.ts`): `{ append(speaker: string, text: string): void }`. `Conversation.Participants.transcript` is widened from `Transcript` to `Sink`; `Transcript` already satisfies it, so the wrappers are untouched.

**`LiveSink`** (new, `src/LiveSink.ts`) implements `Sink` for a run with no file. `LiveSink.for(echo, leadLabel)` builds the same block `Transcript` does (`## <speaker>\n\n<text>\n\n`) and writes it through `echo`, wrapping the block in `echo.dim(...)` when `speaker === leadLabel`. It never touches the filesystem.

**`Conversation`** gains configurable speaker labels so the command can say Lead/Owner. `Participants` gets `labels?: { questioner: string; standIn: string }`, defaulting to `{ questioner: "Questioner", standIn: "StandIn" }`; the loop uses them where it currently writes `"Questioner"` / `"StandIn"`. The wrappers pass nothing and behave exactly as before. The `slickroot` first-message entry and the `<label> turn n/30…` line are unchanged.

### Wiring

`bin/slickroot.ts`, for `conversation`:

1. `const echo = TerminalEcho.for(process.stderr)`.
2. `finished = WatchedPath.at(until)` — snapshotted before anything runs.
3. `lead = ClaudeSession.lead()`, `owner = Primed.with(ClaudeSession.owner(), `${ownerSkill} ${seed}`)`.
4. `Conversation.between({ questioner: lead, standIn: owner, transcript: LiveSink.for(echo, "Lead"), stderr, label: bareName(leadSkill), labels: { questioner: "Lead", standIn: "Owner" }, firstMessage: `${leadSkill} ${seed}`, finished: () => finished.changed() }).run()`.

The turn order that results:

1. slickroot → **lead**: `/xp-stories <seed>` → Q1.
2. slickroot → **owner**: `/xp-stories-owner <seed>` + Q1 → A1 (via `Primed`).
3. slickroot → **lead**: A1 → Q2.
4. … until `finished()` is true after a lead reply. The lead writes the spec (stories) or edits its Technical Design (design), which is what changes `--until`.

No transcript file is created. stdout is empty; the conversation and the `turn n/30…` lines go to stderr, and a failure exits non-zero with a `slickroot:` message, as elsewhere.

### The two owner skills

New skills next to the existing ones in the skills repo, symlinked into `~/.claude/skills/` like the rest:

- `/xp-stories-owner` — answers as the person who wants the feature, one decision at a time.
- `/xp-tech-design-owner` — answers as the project's architect, one decision at a time.

Both declare `disable-model-invocation: true` and are invoked only by slickroot. Each is written to read its `$ARGUMENTS` as the seed on the first line and the lead's message after it, answer only that message, and never write files. The wording is expected to change as Maya watches the conversations; only the contract above is fixed here.

### Tests

- **Unit:**
  - `Primed`: the first message is sent with the prefix and a blank line; later messages are unchanged.
  - `WatchedPath`: `changed()` is `false` right after construction; `true` after a new file appears, after an existing file is edited, and after one is deleted; unrelated paths do not trip it.
  - `LiveSink`: builds the same block as `Transcript`, dims only the lead label, and never writes a file.
  - `Conversation` with `FakeSession`s and `labels: { questioner: "Lead", standIn: "Owner" }`: records `Lead` / `Owner` and dims the lead; the default labels still record `Questioner` / `StandIn`.
  - CLI parsing: `--lead`, `--owner`, `--until` and a multi-word seed; a missing flag or empty seed errors.
- **Acceptance:** the real `bin/slickroot.ts` with the fake `claude` from the existing suite, run as `conversation --lead … --owner … --until docs/specs "<seed>"` in a temp repo. It asserts: the fake's argv shows the lead's first message `/lead <seed>` and the owner's first message `/owner <seed>` followed by the lead's question in one call; the run stops once the lead edits `docs/specs`; stderr carries both sides labelled `Lead` / `Owner` with no escape codes; stdout is empty; and no `runs/` file is written.
