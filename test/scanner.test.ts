import test from "node:test";
import assert from "node:assert/strict";
import { patchModuleSignatures } from "../src/scanner/WorkspaceScanner";
import type { ModuleInfo, SignatureSummary } from "../src/model/index";

function makeModule(name: string, files: string[], signatures: SignatureSummary[] = []): ModuleInfo {
  return { name, files, estimatedCompletion: "partial", inferredPurpose: "General module", signatures };
}

function makeSig(file: string, exports: string[] = []): SignatureSummary {
  return { file, exports, classes: [], interfaces: [], todos: [] };
}

test("patchModuleSignatures returns modules unchanged when updatedSignatures is empty", () => {
  const modules = [makeModule("src", ["src/foo.ts", "src/bar.ts"], [makeSig("src/foo.ts", ["foo"])])];
  const result = patchModuleSignatures(modules, new Map());
  assert.strictEqual(result, modules, "should return the same array reference when nothing changed");
});

test("patchModuleSignatures updates signature for a file in an affected module", () => {
  const original = makeSig("src/foo.ts", ["oldFoo"]);
  const modules = [makeModule("src", ["src/foo.ts", "src/bar.ts"], [original])];

  const updated = makeSig("src/foo.ts", ["newFoo", "anotherFoo"]);
  const result = patchModuleSignatures(modules, new Map([["src/foo.ts", updated]]));

  assert.equal(result.length, 1);
  const sig = result[0].signatures.find((s) => s.file === "src/foo.ts");
  assert.ok(sig, "signature for patched file should exist");
  assert.deepEqual(sig.exports, ["newFoo", "anotherFoo"]);
});

test("patchModuleSignatures does not modify unaffected modules", () => {
  const modA = makeModule("src", ["src/foo.ts"], [makeSig("src/foo.ts", ["foo"])]);
  const modB = makeModule("lib", ["lib/bar.ts"], [makeSig("lib/bar.ts", ["bar"])]);

  const result = patchModuleSignatures([modA, modB], new Map([["src/foo.ts", makeSig("src/foo.ts", ["newFoo"])]]));

  assert.strictEqual(result[1], modB, "unaffected module should be the same reference");
  assert.equal(result[0].signatures[0].exports[0], "newFoo");
});

test("patchModuleSignatures preserves existing signatures for files not in the update map", () => {
  const sigFoo = makeSig("src/foo.ts", ["foo"]);
  const sigBar = makeSig("src/bar.ts", ["bar"]);
  const modules = [makeModule("src", ["src/foo.ts", "src/bar.ts"], [sigFoo, sigBar])];

  // Only update foo — bar should be preserved from the existing module signatures
  const result = patchModuleSignatures(modules, new Map([["src/foo.ts", makeSig("src/foo.ts", ["newFoo"])]]));

  const barSig = result[0].signatures.find((s) => s.file === "src/bar.ts");
  assert.ok(barSig, "bar signature should still exist");
  assert.deepEqual(barSig.exports, ["bar"], "bar signature should be unchanged");
});

test("patchModuleSignatures handles a file with no prior signature entry", () => {
  // Module has foo.ts as a file but no signature for it yet
  const modules = [makeModule("src", ["src/foo.ts", "src/bar.ts"], [makeSig("src/bar.ts", ["bar"])])];

  const result = patchModuleSignatures(modules, new Map([["src/foo.ts", makeSig("src/foo.ts", ["newFoo"])]]));

  const fooSig = result[0].signatures.find((s) => s.file === "src/foo.ts");
  assert.ok(fooSig, "newly patched file should now have a signature");
  assert.deepEqual(fooSig.exports, ["newFoo"]);
});

test("patchModuleSignatures does not mutate the original module array", () => {
  const original = makeSig("src/foo.ts", ["foo"]);
  const modules = [makeModule("src", ["src/foo.ts"], [original])];
  const modulesCopy = [...modules];

  patchModuleSignatures(modules, new Map([["src/foo.ts", makeSig("src/foo.ts", ["newFoo"])]]));

  // Original array structure should be untouched
  assert.equal(modules.length, modulesCopy.length);
  assert.equal(modules[0].signatures[0].exports[0], "foo", "original module should not be mutated");
});
