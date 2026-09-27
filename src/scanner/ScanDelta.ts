import type { SignatureSummary, WorkspaceScan } from "../model/index";

// P4-B1: after autoRescanOnImplement runs a fresh scan, nothing compares it
// to the pre-implement snapshot, so a task's linkedFiles showing real code
// changes never feeds back into task status - only the AI's own
// self-reported taskCompleted flag does. This is a pure comparison so it can
// be tested without a real scanner run.

function buildFileSet(scan: WorkspaceScan | undefined): Set<string> {
  const files = new Set<string>();
  if (!scan) {
    return files;
  }
  for (const module of scan.modules) {
    for (const file of module.files) {
      files.add(file);
    }
  }
  return files;
}

function buildSignatureIndex(scan: WorkspaceScan | undefined): Map<string, SignatureSummary> {
  const index = new Map<string, SignatureSummary>();
  if (!scan) {
    return index;
  }
  for (const module of scan.modules) {
    for (const signature of module.signatures) {
      index.set(signature.file, signature);
    }
  }
  return index;
}

function signatureFingerprint(signature: SignatureSummary | undefined): string | undefined {
  if (!signature) {
    return undefined;
  }
  return JSON.stringify({
    exports: signature.exports,
    classes: signature.classes,
    interfaces: signature.interfaces
  });
}

// Returns the subset of `linkedFiles` that the post-implement scan sees as
// new (not present in the pre-implement scan) or modified (a different
// signature fingerprint), among files the scanner currently tracks at all.
export function findLinkedFilesWithScanDelta(
  preScan: WorkspaceScan | undefined,
  postScan: WorkspaceScan | undefined,
  linkedFiles: string[]
): string[] {
  const preFiles = buildFileSet(preScan);
  const postFiles = buildFileSet(postScan);
  const preSignatures = buildSignatureIndex(preScan);
  const postSignatures = buildSignatureIndex(postScan);

  const changed: string[] = [];
  for (const file of linkedFiles) {
    if (!postFiles.has(file)) {
      continue;
    }
    if (!preFiles.has(file)) {
      changed.push(file);
      continue;
    }
    if (signatureFingerprint(preSignatures.get(file)) !== signatureFingerprint(postSignatures.get(file))) {
      changed.push(file);
    }
  }
  return changed;
}
