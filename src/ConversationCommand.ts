export type ConversationArgs = {
  leadSkill: string;
  ownerSkill: string;
  until: string;
  seed: string;
};

const flags = ["--lead", "--owner", "--until"] as const;

export const ConversationCommand = {
  parse(argv: readonly string[]): ConversationArgs {
    const given = new Map<string, string>();
    const seed: string[] = [];
    for (let at = 0; at < argv.length; at++) {
      const arg = argv[at]!;
      if (!flags.includes(arg as (typeof flags)[number])) {
        seed.push(arg);
        continue;
      }
      const value = argv[at + 1];
      if (value !== undefined) {
        given.set(arg, value);
        at++;
      }
    }
    const leadSkill = given.get("--lead");
    const ownerSkill = given.get("--owner");
    const until = given.get("--until");
    if (leadSkill === undefined) throw new Error("conversation needs a --lead skill");
    if (ownerSkill === undefined) throw new Error("conversation needs an --owner skill");
    if (until === undefined) throw new Error("conversation needs an --until path");
    if (seed.length === 0) throw new Error("conversation needs a seed");
    return { leadSkill, ownerSkill, until, seed: seed.join(" ") };
  },
};

export function bareName(skill: string): string {
  return skill.replace(/^\//, "");
}
