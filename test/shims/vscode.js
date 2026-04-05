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

module.exports = {
  CodeLens,
  EventEmitter,
  Position,
  Range,
  ThemeIcon,
  TreeItem,
  TreeItemCollapsibleState,
  Uri
};
