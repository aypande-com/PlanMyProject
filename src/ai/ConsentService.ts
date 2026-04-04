import * as vscode from "vscode";

export class ConsentService {
  private allowAllThisSession = false;

  constructor(private readonly getConfiguration: () => vscode.WorkspaceConfiguration) {}

  /**
   * Gate an AI operation behind user consent. Returns true when the operation
   * may proceed, false when the user declined.
   *
   * Behaviour is controlled by the requireAiConsent setting:
   *   "never"              — always allow without prompting
   *   "first-per-session"  — prompt once; subsequent calls auto-approve
   *   "always"             — prompt before every operation
   */
  async requestConsent(operation: string, summaryLines: string[]): Promise<boolean> {
    const consentMode = this.getConfiguration().get<string>("requireAiConsent", "first-per-session");

    if (consentMode === "never") {
      return true;
    }

    if (consentMode === "first-per-session" && this.allowAllThisSession) {
      return true;
    }

    const message = [
      `${operation} sends context to configured AI provider.`,
      "Summary:",
      ...summaryLines.map((line) => `- ${line}`),
      "Continue?"
    ].join("\n");

    const decision = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      "Send to AI",
      "Allow for this session"
    );

    if (decision === "Allow for this session") {
      this.allowAllThisSession = true;
      return true;
    }

    return decision === "Send to AI";
  }
}
