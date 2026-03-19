import { type ResearchIndexEntry, type TaskNode } from "../model/index";
import { ensurePmpDir, getResearchIndexUri, readTextFile, uriExists, writeTextFile } from "../storage";
import { extractTags } from "./TagExtractor";

export class ResearchIndex {
  async load(): Promise<ResearchIndexEntry[]> {
    const uri = getResearchIndexUri();
    if (!(await uriExists(uri))) {
      return [];
    }

    try {
      const raw = await readTextFile(uri);
      const parsed = JSON.parse(raw) as ResearchIndexEntry[];
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed;
    } catch {
      return [];
    }
  }

  async appendFromTask(task: TaskNode, conclusion: string): Promise<ResearchIndexEntry> {
    const existing = await this.load();
    const entry: ResearchIndexEntry = {
      taskId: task.id,
      taskTitle: task.title,
      type: task.type === "decision" ? "decision" : "research",
      conclusion,
      tags: extractTags(`${task.title} ${conclusion}`),
      goalRef: task.goalRef,
      completedAt: task.completedAt ?? new Date().toISOString(),
      usedInPrompts: 0
    };

    existing.push(entry);
    await this.save(existing);
    return entry;
  }

  async save(entries: ResearchIndexEntry[]): Promise<void> {
    await ensurePmpDir();
    const uri = getResearchIndexUri();
    await writeTextFile(uri, `${JSON.stringify(entries, null, 2)}\n`);
  }

  async queryRelevant(input: { taskTitle: string; goalStatement?: string; topN?: number }): Promise<ResearchIndexEntry[]> {
    const entries = await this.load();
    if (entries.length === 0) {
      return [];
    }

    const queryTags = new Set(extractTags(`${input.taskTitle} ${input.goalStatement ?? ""}`));
    const ranked = entries
      .map((entry) => {
        const overlap = entry.tags.filter((tag) => queryTags.has(tag)).length;
        const score = overlap * 2 + Math.min(2, Math.floor(entry.usedInPrompts / 3));
        return { entry, score };
      })
      .sort((a, b) => b.score - a.score || b.entry.completedAt.localeCompare(a.entry.completedAt));

    const topN = Math.max(1, input.topN ?? 5);
    const selected = ranked.slice(0, topN).map((item) => ({ ...item.entry }));

    if (selected.length > 0) {
      const selectedIds = new Set(selected.map((entry) => `${entry.taskId}:${entry.completedAt}`));
      for (const entry of entries) {
        const key = `${entry.taskId}:${entry.completedAt}`;
        if (selectedIds.has(key)) {
          entry.usedInPrompts += 1;
        }
      }
      await this.save(entries);
    }

    return selected;
  }
}
