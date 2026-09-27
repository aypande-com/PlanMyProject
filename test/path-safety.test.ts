import test from "node:test";
import assert from "node:assert/strict";
import { isBuildMetadataPath, isSecretBearingPath, isSensitiveWorkspacePath, normalizeWorkspaceRelativePath } from "../src/util";

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

// P0-D2: isSensitiveWorkspacePath is the OR of these two - split so egress
// (collectLinkedFileSnapshots) can refuse SECRET_BEARING outright while still
// allowing BUILD_METADATA through as AI context.
test("isSecretBearingPath matches only the secret-bearing class", () => {
  assert.equal(isSecretBearingPath("src/main.ts"), false);
  assert.equal(isSecretBearingPath(".env"), true);
  assert.equal(isSecretBearingPath("config/.env.local"), true);
  assert.equal(isSecretBearingPath(".git/config"), true);
  assert.equal(isSecretBearingPath(".vscode/settings.json"), true);
  assert.equal(isSecretBearingPath(".github/workflows/ci.yml"), true);
  assert.equal(isSecretBearingPath(".devcontainer/devcontainer.json"), true);
  assert.equal(isSecretBearingPath("package.json"), false, "build metadata is not secret-bearing");
  assert.equal(isSecretBearingPath("../outside.env"), true, "an unparseable path defaults to sensitive");
});

test("isBuildMetadataPath matches only the build-metadata class", () => {
  assert.equal(isBuildMetadataPath("package.json"), true);
  assert.equal(isBuildMetadataPath("package-lock.json"), true);
  assert.equal(isBuildMetadataPath("tsconfig.json"), true);
  assert.equal(isBuildMetadataPath("tsconfig.test.json"), true);
  assert.equal(isBuildMetadataPath(".gitignore"), true);
  assert.equal(isBuildMetadataPath(".env"), false, "secret-bearing is not build metadata");
  assert.equal(isBuildMetadataPath(".git/config"), false, "secret-bearing directories are not build metadata");
  assert.equal(isBuildMetadataPath("src/main.ts"), false);
});
