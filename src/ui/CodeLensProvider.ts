import * as vscode from "vscode";
import { parsePlanMarkdown } from "../parser";

export class PlanCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const parsed = parsePlanMarkdown(document.getText());
    const isV1 = parsed.schemaVersion === "v1";
    const codeLenses: vscode.CodeLens[] = [];

    for (const task of Object.values(parsed.plan.tasks)) {
      if (task.line === undefined || task.line < 0 || task.line >= document.lineCount) {
        continue;
      }

      const range = new vscode.Range(task.line, 0, task.line, 0);
      const args = [{ taskId: task.id, fileUri: document.uri.toString() }];

      if (!isV1) {
        codeLenses.push(new vscode.CodeLens(range, { command: "planmyproject.planTask", title: "Plan", arguments: args }));
        codeLenses.push(new vscode.CodeLens(range, { command: "planmyproject.debateTask", title: "Debate", arguments: args }));
        codeLenses.push(new vscode.CodeLens(range, { command: "planmyproject.implementTask", title: "Implement", arguments: args }));
      }
      codeLenses.push(new vscode.CodeLens(range, { command: "planmyproject.scanTask", title: "Scan", arguments: args }));
    }

    return codeLenses;
  }
}
