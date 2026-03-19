import type { SignatureSummary } from "../model/index";
import { detectLanguageFromPath } from "./LanguageDetector";

const TODO_PATTERN = /\b(TODO|FIXME|HACK)\b[:\-]?\s*(.+)?/gi;

export interface SignatureExtractOptions {
  maxPerFile: number;
}

const DEFAULT_OPTIONS: SignatureExtractOptions = {
  maxPerFile: 200
};

export function extractSignatures(filePath: string, content: string, options?: Partial<SignatureExtractOptions>): SignatureSummary {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const language = detectLanguageFromPath(filePath);
  const summary: SignatureSummary = {
    file: filePath,
    exports: [],
    classes: [],
    interfaces: [],
    todos: []
  };

  if (language === "TypeScript" || language === "JavaScript") {
    collectMatches(content, /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g, summary.exports, resolved.maxPerFile);
    collectMatches(content, /export\s+class\s+([A-Za-z0-9_]+)/g, summary.classes, resolved.maxPerFile);
    collectMatches(content, /export\s+(?:interface|type)\s+([A-Za-z0-9_]+)/g, summary.interfaces, resolved.maxPerFile);
    collectMatches(content, /export\s+const\s+([A-Za-z0-9_]+)/g, summary.exports, resolved.maxPerFile);
  } else if (language === "Python") {
    collectMatches(content, /^\s*def\s+([A-Za-z0-9_]+)/gm, summary.exports, resolved.maxPerFile);
    collectMatches(content, /^\s*async\s+def\s+([A-Za-z0-9_]+)/gm, summary.exports, resolved.maxPerFile);
    collectMatches(content, /^\s*class\s+([A-Za-z0-9_]+)/gm, summary.classes, resolved.maxPerFile);
  } else if (language === "Go") {
    collectMatches(content, /^\s*func\s+([A-Z][A-Za-z0-9_]*)/gm, summary.exports, resolved.maxPerFile);
    collectMatches(content, /^\s*type\s+([A-Z][A-Za-z0-9_]*)\s+struct\b/gm, summary.classes, resolved.maxPerFile);
    collectMatches(content, /^\s*type\s+([A-Z][A-Za-z0-9_]*)\s+interface\b/gm, summary.interfaces, resolved.maxPerFile);
  } else if (language === "Java" || language === "Kotlin" || language === "C#") {
    collectMatches(content, /\bpublic\s+(?:class|interface)\s+([A-Za-z0-9_]+)/g, summary.classes, resolved.maxPerFile);
    collectMatches(content, /\bpublic\s+[A-Za-z0-9_<>,\[\]]+\s+([A-Za-z0-9_]+)\s*\(/g, summary.exports, resolved.maxPerFile);
  }

  for (const match of content.matchAll(TODO_PATTERN)) {
    if (!match[0]) {
      continue;
    }
    summary.todos.push(match[0].trim());
    if (summary.todos.length >= resolved.maxPerFile) {
      break;
    }
  }

  return summary;
}

function collectMatches(content: string, pattern: RegExp, target: string[], max: number): void {
  for (const match of content.matchAll(pattern)) {
    const value = match[1]?.trim();
    if (!value) {
      continue;
    }
    if (!target.includes(value)) {
      target.push(value);
    }
    if (target.length >= max) {
      break;
    }
  }
}
