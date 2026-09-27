import test from "node:test";
import assert from "node:assert/strict";
import { findLinkedFilesWithScanDelta } from "../src/scanner";
import { EMPTY_WORKSPACE_SCAN, type WorkspaceScan } from "../src/model";

function scanWith(modules: WorkspaceScan["modules"]): WorkspaceScan {
  return { ...EMPTY_WORKSPACE_SCAN, modules };
}

test("detects a linked file newly present in the post-implement scan", () => {
  const pre = scanWith([]);
  const post = scanWith([
    { name: "src", files: ["src/foo.ts"], estimatedCompletion: "partial", inferredPurpose: "", signatures: [] }
  ]);

  assert.deepEqual(findLinkedFilesWithScanDelta(pre, post, ["src/foo.ts"]), ["src/foo.ts"]);
});

test("detects a linked file whose signature changed between scans", () => {
  const pre = scanWith([
    {
      name: "src",
      files: ["src/foo.ts"],
      estimatedCompletion: "partial",
      inferredPurpose: "",
      signatures: [{ file: "src/foo.ts", exports: ["oldExport"], classes: [], interfaces: [], todos: [] }]
    }
  ]);
  const post = scanWith([
    {
      name: "src",
      files: ["src/foo.ts"],
      estimatedCompletion: "partial",
      inferredPurpose: "",
      signatures: [{ file: "src/foo.ts", exports: ["oldExport", "newExport"], classes: [], interfaces: [], todos: [] }]
    }
  ]);

  assert.deepEqual(findLinkedFilesWithScanDelta(pre, post, ["src/foo.ts"]), ["src/foo.ts"]);
});

test("does not report a linked file with no change between scans", () => {
  const signatures: WorkspaceScan["modules"][number]["signatures"] = [
    { file: "src/foo.ts", exports: ["sameExport"], classes: [], interfaces: [], todos: [] }
  ];
  const pre = scanWith([{ name: "src", files: ["src/foo.ts"], estimatedCompletion: "partial", inferredPurpose: "", signatures }]);
  const post = scanWith([{ name: "src", files: ["src/foo.ts"], estimatedCompletion: "partial", inferredPurpose: "", signatures }]);

  assert.deepEqual(findLinkedFilesWithScanDelta(pre, post, ["src/foo.ts"]), []);
});

test("does not report a linked file the post-scan does not see at all", () => {
  const pre = scanWith([]);
  const post = scanWith([]);

  assert.deepEqual(findLinkedFilesWithScanDelta(pre, post, ["src/untracked.txt"]), []);
});

test("handles an undefined pre-scan (no prior scan had run yet) as an empty baseline", () => {
  const post = scanWith([
    { name: "src", files: ["src/foo.ts"], estimatedCompletion: "partial", inferredPurpose: "", signatures: [] }
  ]);

  assert.deepEqual(findLinkedFilesWithScanDelta(undefined, post, ["src/foo.ts"]), ["src/foo.ts"]);
});

test("only reports the linked files that actually changed, not every changed file in the scan", () => {
  const pre = scanWith([]);
  const post = scanWith([
    {
      name: "src",
      files: ["src/foo.ts", "src/unrelated.ts"],
      estimatedCompletion: "partial",
      inferredPurpose: "",
      signatures: []
    }
  ]);

  assert.deepEqual(findLinkedFilesWithScanDelta(pre, post, ["src/foo.ts"]), ["src/foo.ts"]);
});
