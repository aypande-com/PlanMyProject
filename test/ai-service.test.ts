import test from "node:test";
import assert from "node:assert/strict";
import * as vscode from "vscode";
import { AIService } from "../src/ai/AIService";

// P0-D1: claudeApiKey/openaiApiKey used to be copied into context.secrets but
// the plaintext setting was left in place indefinitely, re-warning on every
// call. This is now a one-way migration: read once, store to secrets, clear
// the setting at every scope it was set in, notify once.

function createFakeContext(initialSecrets: Record<string, string> = {}) {
  const secrets = new Map<string, string>(Object.entries(initialSecrets));
  const globalState = new Map<string, unknown>();

  const context = {
    secrets: {
      async get(key: string) {
        return secrets.get(key);
      },
      async store(key: string, value: string) {
        secrets.set(key, value);
      },
      async delete(key: string) {
        secrets.delete(key);
      }
    },
    globalState: {
      get<T>(key: string, defaultValue?: T) {
        return (globalState.has(key) ? globalState.get(key) : defaultValue) as T;
      },
      async update(key: string, value: unknown) {
        globalState.set(key, value);
      }
    }
  };

  return { context: context as unknown as vscode.ExtensionContext, secrets };
}

test.beforeEach(() => {
  (vscode as unknown as { __resetVscodeMockState: () => void }).__resetVscodeMockState();
});

test("getApiKey migrates a workspace-scoped setting to secrets and clears it", async () => {
  const { context, secrets } = createFakeContext();
  const configuration = vscode.workspace.getConfiguration("planmyproject");
  await configuration.update("claudeApiKey", "sk-workspace-key", vscode.ConfigurationTarget.Workspace);

  const service = new AIService(context);
  const key = await service.getApiKey("claude");

  assert.equal(key, "sk-workspace-key");
  assert.equal(secrets.get("planmyproject.claudeApiKey"), "sk-workspace-key", "key must land in secrets");
  assert.equal(configuration.get("claudeApiKey", ""), "", "setting must be cleared after migration");
  assert.equal(
    configuration.inspect<string>("claudeApiKey")?.workspaceValue,
    undefined,
    "the workspace-scope value specifically must be cleared, not just masked by a global default"
  );

  const shown = (vscode as unknown as { __getShownMessages: () => Array<{ message: string }> }).__getShownMessages();
  assert.equal(shown.length, 1, "must notify exactly once");
  assert.match(shown[0].message, /moved to.*secure storage/i);
});

test("getApiKey migrates a global-scoped setting and clears that scope specifically", async () => {
  const { context } = createFakeContext();
  const configuration = vscode.workspace.getConfiguration("planmyproject");
  await configuration.update("openaiApiKey", "sk-global-key", vscode.ConfigurationTarget.Global);

  const service = new AIService(context);
  await service.getApiKey("openai");

  assert.equal(configuration.inspect<string>("openaiApiKey")?.globalValue, undefined);
});

test("getApiKey does not re-migrate or re-notify once the setting has been cleared", async () => {
  const { context, secrets } = createFakeContext();
  const configuration = vscode.workspace.getConfiguration("planmyproject");
  await configuration.update("claudeApiKey", "sk-workspace-key", vscode.ConfigurationTarget.Workspace);

  const service = new AIService(context);
  await service.getApiKey("claude");
  const secondKey = await service.getApiKey("claude");

  assert.equal(secondKey, "sk-workspace-key", "second call must fall through to secrets");
  assert.equal(secrets.get("planmyproject.claudeApiKey"), "sk-workspace-key");
  const shown = (vscode as unknown as { __getShownMessages: () => unknown[] }).__getShownMessages();
  assert.equal(shown.length, 1, "must not notify again on the second call");
});

test("getApiKey returns the stored secret directly when no setting is present", async () => {
  const { context } = createFakeContext({ "planmyproject.openaiApiKey": "sk-already-in-secrets" });

  const service = new AIService(context);
  const key = await service.getApiKey("openai");

  assert.equal(key, "sk-already-in-secrets");
  const shown = (vscode as unknown as { __getShownMessages: () => unknown[] }).__getShownMessages();
  assert.equal(shown.length, 0, "must not show any dialog when there is nothing to migrate");
});

test("getApiKey returns undefined when neither a setting nor a secret exists", async () => {
  const { context } = createFakeContext();
  const service = new AIService(context);
  const key = await service.getApiKey("claude");
  assert.equal(key, undefined);
});

function resolveMaskingOptions(service: AIService) {
  return (service as unknown as { resolveMaskingOptions: () => { maskEmails: boolean; maskIpAddresses: boolean } }).resolveMaskingOptions();
}

// P0-D3: maskEmails/maskIpAddresses used to be hardcoded false in
// generateText with no caller able to set them. Testing generateText itself
// would require invoking a real AI provider (network calls, vscode.lm), so
// this verifies the settings read directly instead.
test("resolveMaskingOptions defaults both to false when unset", () => {
  const { context } = createFakeContext();
  const service = new AIService(context);
  assert.deepEqual(resolveMaskingOptions(service), { maskEmails: false, maskIpAddresses: false });
});

test("resolveMaskingOptions reflects planmyproject.masking.* settings", async () => {
  const { context } = createFakeContext();
  const configuration = vscode.workspace.getConfiguration("planmyproject");
  await configuration.update("masking.maskEmails", true, vscode.ConfigurationTarget.Global);
  await configuration.update("masking.maskIpAddresses", true, vscode.ConfigurationTarget.Global);

  const service = new AIService(context);
  assert.deepEqual(resolveMaskingOptions(service), { maskEmails: true, maskIpAddresses: true });
});
