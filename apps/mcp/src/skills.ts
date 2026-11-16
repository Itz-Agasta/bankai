import { memorySkillFiles, SkillsExtension } from "@modelcontextprotocol/server/ext/skills";
import skillMd from "../../../skills/bankai/SKILL.md" with { type: "text" };

/** The bankai skill, served over MCP (Skills extension) as `skill://bankai/SKILL.md`. */
export const bankaiSkills = (): Promise<SkillsExtension> =>
  SkillsExtension.load(memorySkillFiles({ "bankai/SKILL.md": skillMd }));
