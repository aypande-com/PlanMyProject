import * as vscode from "vscode";
import type { DebateEntry, TaskNode } from "../model";
import { ensurePmpDir, getDebateArchiveDirUri, writeTextFile } from "../storage";

export interface DebateArchiveResult {
  activeEntries: DebateEntry[];
  archivedEntries: DebateEntry[];
  archivePath: string | null;
}

export class DebateArchiver {
  constructor(private readonly archiveAfterDays: number) {}

  async archiveOldEntries(task: TaskNode): Promise<DebateArchiveResult> {
    const cutoff = Date.now() - this.archiveAfterDays * 24 * 60 * 60 * 1000;
    const activeEntries: DebateEntry[] = [];
    const archivedEntries: DebateEntry[] = [];

    for (const entry of task.debateLog) {
      const timestamp = Date.parse(entry.timestamp);
      if (!Number.isFinite(timestamp) || timestamp >= cutoff) {
        activeEntries.push(entry);
      } else {
        archivedEntries.push(entry);
      }
    }

    if (archivedEntries.length === 0) {
      return {
        activeEntries,
        archivedEntries,
        archivePath: null
      };
    }

    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) {
      return {
        activeEntries,
        archivedEntries,
        archivePath: null
      };
    }

    await ensurePmpDir(root);
    const archiveDir = getDebateArchiveDirUri(root);
    await vscode.workspace.fs.createDirectory(archiveDir);
    const archiveFile = vscode.Uri.joinPath(archiveDir, `${task.id}.md`);

    const content = buildArchiveContent(task.id, task.title, archivedEntries);
    await writeTextFile(archiveFile, content);

    return {
      activeEntries,
      archivedEntries,
      archivePath: vscode.workspace.asRelativePath(archiveFile, false)
    };
  }

  static hasConflictMarkers(task: TaskNode): boolean {
    return task.debateLog.some((entry) => entry.content.includes("<<<<<<<") || entry.content.includes("=======") || entry.content.includes(">>>>>>>"));
  }
}

function buildArchiveContent(taskId: string, taskTitle: string, entries: DebateEntry[]): string {
  const lines: string[] = [];
  lines.push(`# Debate Archive — ${taskId}`);
  lines.push("");
  lines.push(`Task: ${taskTitle}`);
  lines.push("");

  for (const entry of entries) {
    const author = entry.author ? `[${entry.author}]` : "";
    lines.push(`[${entry.timestamp}]${author}[${entry.role}] ${entry.content}`);
  }

  lines.push("");
  return lines.join("\n");
}
