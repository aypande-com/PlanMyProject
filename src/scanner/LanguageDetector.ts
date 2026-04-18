import type { LanguageInfo } from "../model/index";

const EXT_LANGUAGE: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".java": "Java",
  ".kt": "Kotlin",
  ".kts": "Kotlin",
  ".cs": "C#",
  ".rs": "Rust",
  ".php": "PHP",
  ".rb": "Ruby"
};

export function detectLanguagesByExtension(filePaths: string[]): LanguageInfo[] {
  const counts = new Map<string, number>();
  for (const filePath of filePaths) {
    const extension = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
    const language = EXT_LANGUAGE[extension] ?? "Other";
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([language, files]) => ({ language, files }))
    .sort((a, b) => b.files - a.files);
}

export function detectLanguageFromPath(filePath: string): string {
  const extension = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return EXT_LANGUAGE[extension] ?? "Other";
}
