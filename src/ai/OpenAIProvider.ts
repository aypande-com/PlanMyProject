import type { AIProvider, AIStreamOptions, AITextResponse } from "./types";

export class OpenAIProvider implements AIProvider {
  readonly id = "openai" as const;

  constructor(
    private readonly apiKey: string,
    private readonly model = "gpt-4.1"
  ) {}

  async generate(prompt: string, options?: AIStreamOptions): Promise<AITextResponse> {
    if (!this.apiKey) {
      throw new Error("OpenAI API key is not configured.");
    }

    const primary = await this.callResponsesApi(prompt);
    const text = primary.text;

    if (options?.onChunk && text) {
      await options.onChunk(text);
    }

    return {
      text,
      provider: this.id,
      model: primary.model
    };
  }

  private async callResponsesApi(prompt: string): Promise<{ text: string; model: string }> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const fallback = await this.callChatCompletionsApi(prompt);
      return fallback;
    }

    const payload = await response.json() as {
      output_text?: string;
      model?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };

    let text = payload.output_text ?? "";
    if (!text && Array.isArray(payload.output)) {
      text = payload.output
        .flatMap((item) => item.content ?? [])
        .filter((item) => item.type === "output_text")
        .map((item) => item.text ?? "")
        .join("\n");
    }

    return {
      text,
      model: payload.model ?? this.model
    };
  }

  private async callChatCompletionsApi(prompt: string): Promise<{ text: string; model: string }> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const details = await safeText(response);
      throw new Error(`OpenAI request failed (${response.status}): ${details}`);
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
    };

    const text = payload.choices?.[0]?.message?.content ?? "";
    return {
      text,
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
