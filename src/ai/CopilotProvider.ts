import * as vscode from "vscode";
import type { AIProvider, AIStreamOptions, AITextResponse } from "./types";

export class CopilotProvider implements AIProvider {
  readonly id = "copilot" as const;

  async generate(prompt: string, options?: AIStreamOptions): Promise<AITextResponse> {
    const model = await selectCopilotModel();
    const message = toUserMessage(prompt);
    const response = await model.sendRequest([message], {}, options?.cancellationToken as vscode.CancellationToken | undefined);

    let text = "";
    for await (const fragment of response.text) {
      if (options?.cancellationToken?.isCancellationRequested) {
        throw new Error("Cancelled");
      }
      const chunk = typeof fragment === "string" ? fragment : String(fragment);
      text += chunk;
      if (options?.onChunk) {
        await options.onChunk(chunk);
      }
    }

    return {
      text,
      provider: this.id,
      model: model.id ?? undefined
    };
  }
}

async function selectCopilotModel(): Promise<any> {
  const lmAny = (vscode as unknown as { lm?: { selectChatModels?: (selector: unknown) => Promise<any[]> } }).lm;
  if (!lmAny?.selectChatModels) {
    throw new Error("VS Code LM API is unavailable in this environment.");
  }

  let models = await lmAny.selectChatModels({ vendor: "copilot" });
  if (!models || models.length === 0) {
    models = await lmAny.selectChatModels({});
  }

  if (!models || models.length === 0) {
    throw new Error("No Copilot chat model is available. Sign in to Copilot and retry.");
  }

  return models[0];
}

function toUserMessage(prompt: string): unknown {
  const vsAny = vscode as unknown as {
    LanguageModelChatMessage?: { User: (text: string) => unknown };
  };

  if (vsAny.LanguageModelChatMessage?.User) {
    return vsAny.LanguageModelChatMessage.User(prompt);
  }

  return {
    role: "user",
    content: prompt
  };
}
