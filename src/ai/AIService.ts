import * as vscode from "vscode";
import { maskPromptText } from "../util";
import { ApiKeyError } from "./ApiKeyError";
import { ClaudeProvider } from "./ClaudeProvider";
import { CopilotProvider } from "./CopilotProvider";
import { OpenAIProvider } from "./OpenAIProvider";
import type { AIProvider, AIStreamOptions, AITextResponse } from "./types";

export type AIProviderId = "copilot" | "claude" | "openai";

export class AIService {
  private readonly copilotProvider = new CopilotProvider();
  private cachedClaudeProvider: { key: string; provider: ClaudeProvider } | undefined;
  private cachedOpenAiProvider: { key: string; provider: OpenAIProvider } | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async generateText(prompt: string, options?: AIStreamOptions & { providerOverride?: AIProviderId }): Promise<AITextResponse> {
    const provider = await this.resolveProvider(options?.providerOverride);
    const maskedPrompt = maskPromptText(prompt, {
      maskEmails: false,
      maskIpAddresses: false
    });
    try {
      return await provider.generate(maskedPrompt, options);
    } catch (err) {
      if (err instanceof ApiKeyError) {
        await this.handleExpiredKey(err.provider);
      }
      throw err;
    }
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

    const configuration = vscode.workspace.getConfiguration("planmyproject");
    const configuredSetting = provider === "claude"
      ? configuration.get<string>("claudeApiKey", "")
      : configuration.get<string>("openaiApiKey", "");
    const normalizedSetting = configuredSetting?.trim();
    const normalizedSecret = (await this.context.secrets.get(secretName))?.trim();

    // If user explicitly set a key in settings, use it and refresh secret storage.
    if (normalizedSetting) {
      if (normalizedSetting !== normalizedSecret) {
        await this.context.secrets.store(secretName, normalizedSetting);
      }
      await this.warnApiKeyInSettings(provider);
      return normalizedSetting;
    }

    if (normalizedSecret) {
      return normalizedSecret;
    }

    return undefined;
  }

  private async handleExpiredKey(provider: "claude" | "openai"): Promise<void> {
    // Clear stale cached provider so next call re-resolves with the new key.
    if (provider === "claude") {
      this.cachedClaudeProvider = undefined;
    } else {
      this.cachedOpenAiProvider = undefined;
    }

    // Remove the dead key from secret storage.
    const secretName = provider === "claude"
      ? "planmyproject.claudeApiKey"
      : "planmyproject.openaiApiKey";
    await this.context.secrets.delete(secretName);

    const choice = await vscode.window.showErrorMessage(
      `PlanMyProject: Your ${provider} API key is no longer valid (expired or revoked). ` +
      `The stored key has been cleared.`,
      "Set New Key",
      "Dismiss"
    );
    if (choice === "Set New Key") {
      vscode.commands.executeCommand("planmyproject.setApiKey");
    }
  }

  private async warnApiKeyInSettings(provider: "claude" | "openai"): Promise<void> {
    const suppressKey = `pmp.suppressApiKeySettingsWarning.${provider}`;
    if (this.context.globalState.get<boolean>(suppressKey)) { return; }

    const settingName = provider === "claude" ? "claudeApiKey" : "openaiApiKey";
    const choice = await vscode.window.showWarningMessage(
      `PlanMyProject: Your ${provider} API key is stored in settings.json ` +
      `(planmyproject.${settingName}). If this file is committed to VCS, your key is exposed. ` +
      `Remove the setting and use "PlanMyProject: Set API Key" to store it securely instead.`,
      "Open Settings",
      "Set API Key Now",
      "Don't Show Again"
    );

    if (choice === "Open Settings") {
      vscode.commands.executeCommand("workbench.action.openSettings",
        `planmyproject.${settingName}`);
    } else if (choice === "Set API Key Now") {
      vscode.commands.executeCommand("planmyproject.setApiKey");
    } else if (choice === "Don't Show Again") {
      await this.context.globalState.update(suppressKey, true);
    }
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
      if (this.cachedClaudeProvider?.key !== key) {
        this.cachedClaudeProvider = { key, provider: new ClaudeProvider(key) };
      }
      return this.cachedClaudeProvider.provider;
    }

    const openAiKey = await this.getApiKey("openai");
    if (!openAiKey) {
      throw new Error("OpenAI provider selected but API key is not configured.");
    }
    if (this.cachedOpenAiProvider?.key !== openAiKey) {
      this.cachedOpenAiProvider = { key: openAiKey, provider: new OpenAIProvider(openAiKey) };
    }
    return this.cachedOpenAiProvider.provider;
  }
}
