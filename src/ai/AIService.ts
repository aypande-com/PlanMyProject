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
    const maskedPrompt = maskPromptText(prompt, this.resolveMaskingOptions());
    try {
      return await provider.generate(maskedPrompt, options);
    } catch (err) {
      if (err instanceof ApiKeyError) {
        await this.handleExpiredKey(err.provider);
      }
      throw err;
    }
  }

  // P0-D3: maskEmails/maskIpAddresses were hardcoded false with no caller
  // able to set them - an option nothing can reach is worse than no option.
  // Wired to real settings instead of deleted, since masking emails/IPs is a
  // legitimate per-user preference distinct from the unconditional secret
  // patterns in PromptMasker, which are never optional. Extracted to its own
  // method so the settings read is directly testable without invoking a real
  // AI provider.
  private resolveMaskingOptions(): { maskEmails: boolean; maskIpAddresses: boolean } {
    const configuration = vscode.workspace.getConfiguration("planmyproject");
    return {
      maskEmails: configuration.get<boolean>("masking.maskEmails", false),
      maskIpAddresses: configuration.get<boolean>("masking.maskIpAddresses", false)
    };
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
    const settingKey = provider === "claude" ? "claudeApiKey" : "openaiApiKey";

    const configuration = vscode.workspace.getConfiguration("planmyproject");
    const configuredSetting = configuration.get<string>(settingKey, "");
    const normalizedSetting = configuredSetting?.trim();

    // One-way migration (P0-D1): a key found in settings.json is moved to
    // context.secrets and the plaintext setting is cleared, at every scope it
    // was set in - claudeApiKey/openaiApiKey are now `application`-scoped, so
    // this is also the path that repairs a workspace settings.json left over
    // from before that scope existed. This runs at most once per key: after
    // the setting is cleared, later calls fall straight through to secrets.
    if (normalizedSetting) {
      await this.context.secrets.store(secretName, normalizedSetting);
      await this.clearSettingAtEveryScope(configuration, settingKey);
      await this.notifyApiKeyMigrated(provider, settingKey);
      return normalizedSetting;
    }

    const normalizedSecret = (await this.context.secrets.get(secretName))?.trim();
    if (normalizedSecret) {
      return normalizedSecret;
    }

    return undefined;
  }

  private async clearSettingAtEveryScope(configuration: vscode.WorkspaceConfiguration, key: string): Promise<void> {
    const inspected = configuration.inspect<string>(key);
    if (inspected?.globalValue !== undefined) {
      await configuration.update(key, undefined, vscode.ConfigurationTarget.Global);
    }
    if (inspected?.workspaceValue !== undefined) {
      await configuration.update(key, undefined, vscode.ConfigurationTarget.Workspace);
    }
    if (inspected?.workspaceFolderValue !== undefined) {
      await configuration.update(key, undefined, vscode.ConfigurationTarget.WorkspaceFolder);
    }
  }

  private async notifyApiKeyMigrated(provider: "claude" | "openai", settingKey: string): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
      `PlanMyProject: Your ${provider} API key was found in settings.json (planmyproject.${settingKey}) and has been moved to ` +
      `secure storage. It has been removed from settings.json. If this file was ever committed to version control, treat the ` +
      `key as compromised and rotate it.`,
      "Open Settings"
    );
    if (choice === "Open Settings") {
      await vscode.commands.executeCommand("workbench.action.openSettings", `planmyproject.${settingKey}`);
    }
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
