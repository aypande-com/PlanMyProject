import * as vscode from "vscode";
import { EMPTY_WORKSPACE_SCAN, type WorkspaceScan } from "../model";
import { ensurePmpDir, getScanCacheUri, readTextFile, uriExists, writeTextFile } from "./WorkspaceFiles";

export class ScanCacheStore {
  async load(): Promise<WorkspaceScan | undefined> {
    const uri = getScanCacheUri();
    if (!(await uriExists(uri))) {
      return undefined;
    }

    try {
      const raw = await readTextFile(uri);
      const parsed = JSON.parse(raw) as WorkspaceScan;
      return parsed;
    } catch {
      return undefined;
    }
  }

  async save(scan: WorkspaceScan): Promise<void> {
    await ensurePmpDir();
    const uri = getScanCacheUri();
    await writeTextFile(uri, `${JSON.stringify(scan, null, 2)}\n`);
  }

  async clear(): Promise<void> {
    const uri = getScanCacheUri();
    if (!(await uriExists(uri))) {
      return;
    }

    await vscode.workspace.fs.delete(uri);
  }

  static emptyWithRoot(rootPath: string): WorkspaceScan {
    return {
      ...EMPTY_WORKSPACE_SCAN,
      scannedAt: new Date().toISOString(),
      rootPath
    };
  }
}
