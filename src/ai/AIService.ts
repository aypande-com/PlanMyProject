import * as vscode from "vscode";
import { maskPromptText } from "../util";
import { ClaudeProvider } from "./ClaudeProvider";
import { CopilotProvider } from "./CopilotProvider";
import { OpenAIProvider } from "./OpenAIProvider";
import type { AIProvider, AIStreamOptions, AITextResponse } from "./types";

export type AIProviderId = "copilot" | "claude" | "openai";

export class AIService {
  private readonly copilotProvider = new CopilotProvider();

  constructor(private readonly context: vscode.ExtensionContext) {}

  async generateText(prompt: string, options?: AIStreamOptions & { providerOverride?: AIProviderId }): Promise<AITextResponse> {
    const provider = await this.resolveProvider(options?.providerOverride);
    const maskedPrompt = maskPromptText(prompt, {
      maskEmails: false,
      maskIpAddresses: false
    });
    return provider.generate(maskedPrompt, options);
  }

  getSelectedProvider(): AIProviderId {
    const configuration = vscode.workspace.getConfiguration("planmyproject");
    const provider = configuration.get<AIProviderId>("aiProvider", "copilot");
    if (provider === "copilot" || provider === "claude" || provider === "openai") {
      return provider;
    }
    return "copilot";
  }

  async setApiKey(provider: Exclude<AIProviderId, "copilot">, key: string): Promise<void> {
    const secretName = provider === "claude"
      ? "planmyproject.claudeApiKey"
      : "planmyproject.openaiApiKey";

    await this.context.secrets.store(secretName, key);
  }

  async getApiKey(provider: Exclude<AIProviderId, "copilot">): Promise<string | undefined> {
    const secretName = provider === "claude"
      ? "planmyproject.claudeApiKey"
      : "planmyproject.openaiApiKey";

    const secret = await this.context.secrets.get(secretName);
    if (secret && secret.trim()) {
      return secret.trim();
    }

    const configuration = vscode.workspace.getConfiguration("planmyproject");
    const legacySetting = provider === "claude"
      ? configuration.get<string>("claudeApiKey", "")
      : configuration.get<string>("openaiApiKey", "");

    if (legacySetting?.trim()) {
      await this.context.secrets.store(secretName, legacySetting.trim());
      return legacySetting.trim();
    }

    return undefined;
  }

  private async resolveProvider(override?: AIProviderId): Promise<AIProvider> {
    const providerId = override ?? this.getSelectedProvider();

    if (providerId === "copilot") {
      return this.copilotProvider;
    }

    if (providerId === "claude") {
      const key = await this.getApiKey("claude");
      if (!key) {
        throw new Error("Claude provider selected but API key is not configured.");
      }
      return new ClaudeProvider(key);
    }

    const openAiKey = await this.getApiKey("openai");
    if (!openAiKey) {
      throw new Error("OpenAI provider selected but API key is not configured.");
    }
    return new OpenAIProvider(openAiKey);
  }
}
