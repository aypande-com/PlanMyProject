const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "into", "using", "use", "task", "plan", "project", "decision", "research", "implement", "implementation"
]);

export function extractTags(input: string, limit = 12): string[] {
  const counts = new Map<string, number>();
  for (const token of input.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length < 3 || STOP_WORDS.has(token)) {
      continue;
    }
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([token]) => token);
}
