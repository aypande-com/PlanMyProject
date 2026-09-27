"use strict";

class EventEmitter {
  constructor() {
    this._listeners = new Set();
    this.event = (listener) => {
      this._listeners.add(listener);
      return {
        dispose: () => {
          this._listeners.delete(listener);
        }
      };
    };
  }

  fire(value) {
    for (const listener of Array.from(this._listeners)) {
      listener(value);
    }
  }

  dispose() {
    this._listeners.clear();
  }
}

const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2
};

class TreeItem {
  constructor(label, collapsibleState = TreeItemCollapsibleState.None) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

class ThemeIcon {
  constructor(id) {
    this.id = id;
  }
}

class Uri {
  constructor(fsPath) {
    this.fsPath = fsPath;
  }

  static file(fsPath) {
    return new Uri(fsPath);
  }

  static joinPath(base, ...segments) {
    const parts = segments.flatMap((segment) => String(segment).split("/")).filter((part) => part.length > 0);
    return new Uri([base.fsPath, ...parts].join("/"));
  }
}

class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}

class Range {
  constructor(startLineOrPosition, startCharacter, endLine, endCharacter) {
    if (typeof startLineOrPosition === "number") {
      this.start = new Position(startLineOrPosition, startCharacter);
      this.end = new Position(endLine, endCharacter);
    } else {
      this.start = startLineOrPosition;
      this.end = startCharacter;
    }
  }
}

class CodeLens {
  constructor(range, command) {
    this.range = range;
    this.command = command;
  }
}

// --- Minimal workspace configuration + dialog mocks -------------------------
// Real vscode has no equivalent test API, so this is shim-only surface (the
// `__` prefix marks it as such). Added for P0-D1 (AIService's settings-scope
// migration) and reusable by anything else that needs to drive
// getConfiguration()/update()/inspect() or window dialogs without a live
// VS Code host.

const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3
};

const TARGET_FIELD = {
  [ConfigurationTarget.Global]: "globalValue",
  [ConfigurationTarget.Workspace]: "workspaceValue",
  [ConfigurationTarget.WorkspaceFolder]: "workspaceFolderValue"
};

const configurationStores = new Map();

class MockWorkspaceConfiguration {
  constructor(section, store) {
    this._section = section;
    this._store = store;
  }

  get(key, defaultValue) {
    const entry = this._store.get(key);
    if (!entry) {
      return defaultValue;
    }
    if (entry.workspaceFolderValue !== undefined) return entry.workspaceFolderValue;
    if (entry.workspaceValue !== undefined) return entry.workspaceValue;
    if (entry.globalValue !== undefined) return entry.globalValue;
    return defaultValue;
  }

  async update(key, value, target) {
    const entry = this._store.get(key) ?? {};
    const field = TARGET_FIELD[target] ?? "workspaceValue";
    if (value === undefined) {
      delete entry[field];
    } else {
      entry[field] = value;
    }
    this._store.set(key, entry);
  }

  inspect(key) {
    const entry = this._store.get(key) ?? {};
    return { key: `${this._section}.${key}`, ...entry };
  }
}

function getConfiguration(section) {
  if (!configurationStores.has(section)) {
    configurationStores.set(section, new Map());
  }
  return new MockWorkspaceConfiguration(section, configurationStores.get(section));
}

let queuedDialogResponses = [];
let shownMessages = [];

async function showMessage(severity, message, ...rest) {
  shownMessages.push({ severity, message, args: rest });
  if (queuedDialogResponses.length > 0) {
    return queuedDialogResponses.shift();
  }
  return undefined;
}

let executedCommands = [];

const commands = {
  async executeCommand(command, ...args) {
    executedCommands.push({ command, args });
    return undefined;
  }
};

const window = {
  showInformationMessage: (message, ...rest) => showMessage("information", message, ...rest),
  showWarningMessage: (message, ...rest) => showMessage("warning", message, ...rest),
  showErrorMessage: (message, ...rest) => showMessage("error", message, ...rest)
};

// --- Minimal workspace.fs mock ----------------------------------------------
// In-memory only, keyed by Uri#fsPath. Enough for code that reads/writes/
// stats a handful of files and checks existence (uriExists in
// src/storage/WorkspaceFiles.ts) - not a real filesystem, no directory
// listing, no symlinks. `..` segments in Uri.joinPath are NOT resolved (see
// above), so avoid them in tests that use this mock.

const mockFiles = new Map();
let mockWorkspaceFolders;

const workspaceFs = {
  async readFile(uri) {
    const content = mockFiles.get(uri.fsPath);
    if (content === undefined) {
      const err = new Error(`ENOENT: no mock file at ${uri.fsPath}`);
      err.code = "FileNotFound";
      throw err;
    }
    return content;
  },
  async writeFile(uri, content) {
    mockFiles.set(uri.fsPath, content);
  },
  async stat(uri) {
    if (!mockFiles.has(uri.fsPath)) {
      const err = new Error(`ENOENT: no mock file at ${uri.fsPath}`);
      err.code = "FileNotFound";
      throw err;
    }
    return { type: 1, ctime: 0, mtime: 0, size: mockFiles.get(uri.fsPath).length };
  },
  async createDirectory() {
    // No-op: directories are implicit in this in-memory mock.
  }
};

const workspace = {
  getConfiguration,
  fs: workspaceFs,
  get workspaceFolders() {
    return mockWorkspaceFolders;
  }
};

// Test-only controls (not part of the real vscode API):
function __resetVscodeMockState() {
  configurationStores.clear();
  queuedDialogResponses = [];
  shownMessages = [];
  executedCommands = [];
  mockFiles.clear();
  mockWorkspaceFolders = undefined;
}

function __queueDialogResponse(response) {
  queuedDialogResponses.push(response);
}

function __getShownMessages() {
  return shownMessages;
}

function __getExecutedCommands() {
  return executedCommands;
}

function __setWorkspaceFolder(fsPath) {
  mockWorkspaceFolders = [{ uri: new Uri(fsPath), name: "mock-workspace", index: 0 }];
}

function __setMockFile(relativePathFromRoot, content) {
  if (!mockWorkspaceFolders) {
    throw new Error("__setMockFile requires __setWorkspaceFolder to be called first");
  }
  const root = mockWorkspaceFolders[0].uri.fsPath;
  const fsPath = [root, ...relativePathFromRoot.split("/")].join("/");
  mockFiles.set(fsPath, Buffer.from(content, "utf8"));
}

module.exports = {
  CodeLens,
  ConfigurationTarget,
  EventEmitter,
  Position,
  Range,
  ThemeIcon,
  TreeItem,
  TreeItemCollapsibleState,
  Uri,
  commands,
  window,
  workspace,
  __resetVscodeMockState,
  __queueDialogResponse,
  __getShownMessages,
  __getExecutedCommands,
  __setWorkspaceFolder,
  __setMockFile
};
