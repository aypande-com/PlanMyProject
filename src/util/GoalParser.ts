import type { ProjectGoal } from "../model/index";
import { createGoalIdGenerator } from "./IdGenerator";

/**
 * Section heading patterns recognised as labelled sections in imported goal docs.
 * Matches: ## Success Criteria, ### Success Criteria, **Success Criteria**, etc.
 */
const SECTION_HEADING_RE = /^(?:#{1,4}\s+|\*\*|__)?([^*_\n]+?)(?:\*\*|__)?\s*$/;

type SectionKey = "successCriteria" | "constraints" | "outOfScope";

const SECTION_ALIASES: Array<{ key: SectionKey; patterns: RegExp[] }> = [
  {
    key: "successCriteria",
    patterns: [/success\s+criteria/i, /acceptance\s+criteria/i, /^objectives?$/i]
  },
  {
    key: "constraints",
    patterns: [/^constraints?$/i, /^limitations?$/i, /^non.?goals?$/i, /^requirements?$/i]
  },
  {
    key: "outOfScope",
    patterns: [/out[\s-]+of[\s-]+scope/i, /^excluded?$/i, /not\s+in\s+scope/i]
  }
];

function identifySection(headingText: string): SectionKey | null {
  const text = headingText.trim();
  for (const { key, patterns } of SECTION_ALIASES) {
    if (patterns.some((re) => re.test(text))) {
      return key;
    }
  }
  return null;
}

function extractBullets(lines: string[]): string[] {
  return lines
    .filter((line) => /^\s*[-*+]\s+/.test(line))
    .map((line) => line.replace(/^\s*[-*+]\s+/, "").trim())
    .filter((line) => line.length > 0);
}

/**
 * Pure function — no VS Code dependency.
 *
 * Parses a markdown document into a ProjectGoal. Recognises labelled sections
 * (## Success Criteria, ## Constraints, ## Out of Scope) and maps their bullet
 * lists into the corresponding goal fields. Falls back to treating all top-level
 * bullets as success criteria when no labelled sections are found.
 */
export function parseGoalMarkdown(content: string, existingGoals: { id: string }[]): Omit<ProjectGoal, "id"> & { id: string } {
  const id = createGoalIdGenerator(existingGoals)();
  const lines = content.split(/\r?\n/);

  // Derive the goal statement from the first h1/h2 heading.
  const heading = lines.find((line) => /^#{1,2}\s+/.test(line.trim()));
  const statement = heading
    ? heading.replace(/^#{1,2}\s+/, "").trim()
    : lines.find((line) => line.trim().length > 0)?.trim() ?? "Imported project goal";

  // Collect content under each recognised section heading.
  const sections: Record<SectionKey, string[]> = {
    successCriteria: [],
    constraints: [],
    outOfScope: []
  };

  let currentSection: SectionKey | null = null;

  for (const line of lines) {
    const headingMatch = SECTION_HEADING_RE.exec(line.trim());
    // Only treat h2-h4 and bold-label lines as section headings.
    // h1 lines (single #) are the goal title and must not be classified as sections.
    if (headingMatch && /^(?:#{2,4}\s|\*\*|__)/.test(line.trim())) {
      currentSection = identifySection(headingMatch[1]);
      continue;
    }

    if (currentSection && /^\s*[-*+]\s+/.test(line)) {
      const bullet = line.replace(/^\s*[-*+]\s+/, "").trim();
      if (bullet.length > 0) {
        sections[currentSection].push(bullet);
      }
    }
  }

  const hasSections = Object.values(sections).some((arr) => arr.length > 0);

  return {
    id,
    statement,
    successCriteria: hasSections ? sections.successCriteria.slice(0, 10) : extractBullets(lines).slice(0, 6),
    constraints: sections.constraints.slice(0, 10),
    outOfScope: sections.outOfScope.slice(0, 10)
  };
}
