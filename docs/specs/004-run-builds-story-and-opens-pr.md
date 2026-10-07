# The run goes on to build the story and open a pull request

Maya runs slickroot in her project's repo. She answers no questions. The next story gets written, its technical design gets filled in, and then the same run goes on to build it. When she comes back from her coffee, a pull request for the story is waiting for her. Happy, she starts reviewing it.

## Acceptance Criteria

- Once the technical design is filled in, the same run goes on to implement the spec. Maya runs no second command.
- The `/xp-implement` skill is run on the new spec, using a Sonnet model.
- The run ends with an open pull request, as the skill already does.
- While the story is being implemented, Claude's output shows in the terminal as it happens, so the PR link is visible at the end.
- The spec path is no longer printed at the end. The streamed output is enough.
- If the implementation fails, the run fails with a non-zero exit.

## Technical Design
