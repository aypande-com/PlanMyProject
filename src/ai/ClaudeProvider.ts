import { ApiKeyError, isAuthStatus } from "./ApiKeyError";
import type { AIProvider, AIStreamOptions, AITextResponse } from "./types";

export class ClaudeProvider implements AIProvider {
  readonly id = "claude" as const;

  constructor(
    private readonly apiKey: string,
    private readonly model = "claude-3-7-sonnet-latest"
  ) {}

  async generate(prompt: string, options?: AIStreamOptions): Promise<AITextResponse> {
    if (!this.apiKey) {
      throw new Error("Claude API key is not configured.");
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1800,
        temperature: 0.2,
        messages: [
          { role: "user", content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const details = await safeText(response);
      if (isAuthStatus(response.status)) {
        throw new ApiKeyError("claude",
          `Claude API key is invalid or expired (${response.status}). ` +
          `Use "PlanMyProject: Set API Key" to update it.`);
      }
      throw new Error(`Claude request failed (${response.status}): ${details}`);
    }

    const payload = await response.json() as {
      content?: Array<{ type?: string; text?: string }>;
      model?: string;
    };

    const text = payload.content
      ?.filter((item) => item.type === "text")
      .map((item) => item.text ?? "")
      .join("\n")
      .trim() ?? "";

    if (options?.onChunk && text) {
      await options.onChunk(text);
    }

    return {
      text,
      provider: this.id,
      model: payload.model ?? this.model
    };
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 400);
  } catch {
    return "unknown error";
  }
}
