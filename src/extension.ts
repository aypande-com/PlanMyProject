import * as vscode from "vscode";
import { PlanController } from "./controller/PlanController";

let controller: PlanController | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  controller = new PlanController(context);
  context.subscriptions.push(controller);
  await controller.activate();
}

export function deactivate(): void {
  controller?.dispose();
  controller = undefined;
}
