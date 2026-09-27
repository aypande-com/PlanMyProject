import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  resolveSafeTargetPath,
  resolveStricterBooleanGate,
  resolveStricterNumberGate,
  isSecretBearingPath
} from "../src/util";
import {
  TaskCommandService,
  type TaskCommandContext,
  type TaskCommandServices
} from "../src/controller/TaskCommandService";
import { createTaskNode, type TaskNode } from "../src/model";

// P0-D4: the security regression suite. Consolidates the behavioral
// guarantees the earlier P0-D units add, in one place, so a future change
// that quietly breaks one of them fails a test named for exactly that
// guarantee - not a generic "something in this area broke."

test.beforeEach(() => {
  (vscode as unknown as { __resetVscodeMockState: () => void }).__resetVscodeMockState();
});

// --- I12: a workspace may make a gate stricter, never weaker ---------------

test("a workspace value cannot weaken researchGate below what the user has set", async () => {
  const configuration = vscode.workspace.getConfiguration("planmyproject");
  await configuration.update("researchGate", true, vscode.ConfigurationTarget.Global);
  await configuration.update("researchGate", false, vscode.ConfigurationTarget.Workspace);

  assert.equal(
    resolveStricterBooleanGate(configuration, "researchGate", true),
    true,
    "workspace=false must not override user=true - that would weaken the gate"
  );
});

test("a workspace value can make researchGate stricter than the user's own value", async () => {
  const configuration = vscode.workspace.getConfiguration("planmyproject");
  await configuration.update("researchGate", false, vscode.ConfigurationTarget.Global);
  await configuration.update("researchGate", true, vscode.ConfigurationTarget.Workspace);

  assert.equal(
    resolveStricterBooleanGate(configuration, "researchGate", true),
    true,
    "workspace=true is a legitimate strengthening, e.g. a team repo requiring research gating for everyone"
  );
});

test("a workspace value cannot lower confidenceThreshold below what the user has set", async () => {
  const configuration = vscode.workspace.getConfiguration("planmyproject");
  await configuration.update("confidenceThreshold", 0.8, vscode.ConfigurationTarget.Global);
  await configuration.update("confidenceThreshold", 0.1, vscode.ConfigurationTarget.Workspace);

  assert.equal(
    resolveStricterNumberGate(configuration, "confidenceThreshold", 0.5),
    0.8,
    "workspace=0.1 must not override user=0.8 - a lower threshold auto-commits more, which is weaker"
  );
});

test("a workspace value can raise confidenceThreshold above the user's own value", async () => {
  const configuration = vscode.workspace.getConfiguration("planmyproject");
  await configuration.update("confidenceThreshold", 0.3, vscode.ConfigurationTarget.Global);
  await configuration.update("confidenceThreshold", 0.9, vscode.ConfigurationTarget.Workspace);

  assert.equal(resolveStricterNumberGate(configuration, "confidenceThreshold", 0.5), 0.9);
});

// --- machine/application scope: a workspace setting has no effect at all ---

for (const key of ["requireAiConsent", "sendFileContentsToAI", "aiProvider", "defaultTaskFileSendPolicy"]) {
  test(`a workspace-set value for the machine-scoped setting ${key} has no effect`, async () => {
    const configuration = vscode.workspace.getConfiguration("planmyproject");
    await configuration.update(key, "attacker-value", vscode.ConfigurationTarget.Workspace);

    assert.equal(
      configuration.get(key, "safe-default"),
      "safe-default",
      `${key} is machine-scoped - a workspace-committed settings.json must not be able to set it at all`
    );
  });
}

test("a workspace-set value for the application-scoped claudeApiKey has no effect on the merged value", async () => {
  const configuration = vscode.workspace.getConfiguration("planmyproject");
  await configuration.update("claudeApiKey", "attacker-supplied-key", vscode.ConfigurationTarget.Workspace);

  assert.equal(
    configuration.get("claudeApiKey", ""),
    "",
    "application scope means only the user's own global value counts, never a workspace override"
  );
});

// --- P0-D2: secret-bearing files are refused on egress, by name ------------

test(".env reached through linkedFiles is refused on egress and named to the user", async () => {
  (vscode as unknown as { __setWorkspaceFolder: (p: string) => void }).__setWorkspaceFolder("/workspace");
  (vscode as unknown as { __setMockFile: (p: string, c: string) => void }).__setMockFile(".env", "SECRET=abc123");

  const task = createTaskNode({ id: "T0001", title: "Implement foo", type: "implementation", fileSendPolicy: "always" });
  task.linkedFiles = [".env"];

  const ctx: Partial<TaskCommandContext> = { getConfiguration: () => vscode.workspace.getConfiguration("planmyproject") };
  const service = new TaskCommandService(ctx as unknown as TaskCommandContext, {} as unknown as TaskCommandServices);
  const { snapshots, refused } = await (
    service as unknown as {
      collectLinkedFileSnapshots: (task: TaskNode) => Promise<{ snapshots: unknown[]; refused: string[] }>;
    }
  ).collectLinkedFileSnapshots(task);

  assert.deepEqual(snapshots, [], "no content from a secret-bearing file must reach the prompt");
  assert.deepEqual(refused, [".env"], "the refused file must be named, not silently dropped");
});

test("isSecretBearingPath has no per-task or per-workspace override - the check itself cannot be weakened", () => {
  // There is deliberately no settings-driven allowlist for this check. If a
  // future change adds one, this test forces it to be a conscious decision
  // documented as an amendment, not something that falls out of a refactor.
  assert.equal(isSecretBearingPath(".env"), true);
  assert.equal(isSecretBearingPath(".env.production"), true);
});

// --- P0-D2 (write path)/general: symlink escape blocked --------------------

test("resolveSafeTargetPath blocks a write through a symlink that escapes the workspace root", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pmp-root-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "pmp-outside-"));
  try {
    await fs.symlink(outside, path.join(root, "linked"), "dir");

    await assert.rejects(
      () => resolveSafeTargetPath(root, "linked/exfiltrated.txt"),
      /symlink outside workspace root/,
      "a symlinked directory inside the root pointing outside it must be refused"
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test("resolveSafeTargetPath blocks a symlink escape nested several directories deep", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pmp-root-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "pmp-outside-"));
  try {
    await fs.mkdir(path.join(root, "a", "b"), { recursive: true });
    await fs.symlink(outside, path.join(root, "a", "b", "linked"), "dir");

    await assert.rejects(() => resolveSafeTargetPath(root, "a/b/linked/exfiltrated.txt"), /symlink outside workspace root/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test("resolveSafeTargetPath allows a normal nested path with no symlinks involved", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pmp-root-"));
  try {
    const resolved = await resolveSafeTargetPath(root, "src/nested/file.ts");
    assert.equal(resolved, path.resolve(root, "src/nested/file.ts"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("resolveSafeTargetPath rejects plain path traversal before touching the filesystem", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pmp-root-"));
  try {
    await assert.rejects(() => resolveSafeTargetPath(root, "../../etc/passwd"), /Invalid relative path/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
