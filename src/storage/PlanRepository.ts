import * as vscode from "vscode";
import { createEmptyPlanDocument, type PlanDocument } from "../model/index";
import { parsePlanMarkdown, serializePlanMarkdown } from "../parser/PlanParser";
import {
  DEFAULT_PLAN_FILENAME,
  findOrCreatePlanUri,
  getPmpDirUri,
  readTextFile,
  uriExists,
  writeTextFile
} from "./WorkspaceFiles";

export class PlanRepository {
  constructor(private readonly planFileName: string = DEFAULT_PLAN_FILENAME) {}

  async getPlanUri(): Promise<vscode.Uri> {
    return findOrCreatePlanUri(this.planFileName);
  }

  async ensurePlanFile(): Promise<vscode.Uri> {
    const uri = await this.getPlanUri();
    if (!(await uriExists(uri))) {
      const initial = serializePlanMarkdown(createEmptyPlanDocument());
      await writeTextFile(uri, initial);
    }
    return uri;
  }

  async loadPlan(): Promise<{ uri: vscode.Uri; parsed: ReturnType<typeof parsePlanMarkdown> }> {
    const uri = await this.ensurePlanFile();
    const text = await readTextFile(uri);
    const parsed = parsePlanMarkdown(text);
    return { uri, parsed };
  }

  async savePlan(uri: vscode.Uri, plan: PlanDocument, options?: { researchGate?: boolean; showRationaleInline?: boolean }): Promise<string> {
    const serialized = serializePlanMarkdown(plan, {
      researchGate: options?.researchGate,
      showRationaleInline: options?.showRationaleInline
    });
    await writeTextFile(uri, serialized);
    return serialized;
  }

  async createV1Backup(uri: vscode.Uri, content: string): Promise<vscode.Uri> {
    const pmpDir = getPmpDirUri(vscode.Uri.joinPath(uri, ".."));
    await vscode.workspace.fs.createDirectory(pmpDir);
    const backupUri = vscode.Uri.joinPath(pmpDir, "planmyproject.v1.backup.md");
    await writeTextFile(backupUri, content);
    return backupUri;
  }
}
