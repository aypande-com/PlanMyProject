import * as vscode from "vscode";
import type { ProjectGoal } from "../model";
import { createGoalIdGenerator } from "../util";

export class GoalSetupPanel {
  async promptForGoal(existingGoals: ProjectGoal[]): Promise<ProjectGoal | undefined> {
    const statement = await vscode.window.showInputBox({
      prompt: "Enter project goal statement",
      placeHolder: "Build a multi-tenant SaaS invoicing tool",
      ignoreFocusOut: true
    });
    if (!statement?.trim()) {
      return undefined;
    }

    const criteria = await promptMultiLineList(
      "Enter success criteria (one per line, comma-separated accepted)",
      "Users can create invoices, Users can send invoices via email"
    );
    if (!criteria) {
      return undefined;
    }

    const constraints = await promptMultiLineList(
      "Enter known constraints",
      "React frontend, Node backend"
    );
    if (!constraints) {
      return undefined;
    }

    const outOfScope = await promptMultiLineList(
      "Enter explicit out-of-scope items",
      "Payment processing"
    );
    if (!outOfScope) {
      return undefined;
    }

    const nextGoalId = createGoalIdGenerator(existingGoals);
    return {
      id: nextGoalId(),
      statement: statement.trim(),
      successCriteria: criteria,
      constraints,
      outOfScope
    };
  }
}

async function promptMultiLineList(prompt: string, placeholder: string): Promise<string[] | undefined> {
  const value = await vscode.window.showInputBox({
    prompt,
    placeHolder: placeholder,
    ignoreFocusOut: true
  });

  if (value === undefined) {
    return undefined;
  }

  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
