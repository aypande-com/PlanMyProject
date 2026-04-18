import test from "node:test";
import assert from "node:assert/strict";
import { isSensitiveWorkspacePath, normalizeWorkspaceRelativePath } from "../src/util";

test("normalizeWorkspaceRelativePath blocks absolute and traversal paths", () => {
  assert.equal(normalizeWorkspaceRelativePath("src/main.ts"), "src/main.ts");
  assert.equal(normalizeWorkspaceRelativePath("./src/main.ts"), "src/main.ts");
  assert.equal(normalizeWorkspaceRelativePath("../outside.ts"), undefined);
  assert.equal(normalizeWorkspaceRelativePath("/etc/passwd"), undefined);
});

test("isSensitiveWorkspacePath marks protected targets", () => {
  assert.equal(isSensitiveWorkspacePath("src/main.ts"), false);
  assert.equal(isSensitiveWorkspacePath("package.json"), true);
  assert.equal(isSensitiveWorkspacePath(".github/workflows/ci.yml"), true);
  assert.equal(isSensitiveWorkspacePath("config/.env.local"), true);
});
