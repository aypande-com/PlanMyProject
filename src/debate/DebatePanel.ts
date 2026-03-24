import * as vscode from "vscode";
import type { TaskNode } from "../model/index";

export interface DebatePanelCallbacks {
  onUserMessage: (message: string) => Promise<void>;
  onAction: (action: "accept" | "rewrite" | "split" | "dismiss" | "defer") => Promise<void>;
}

export class DebatePanel {
  private panel: vscode.WebviewPanel | undefined;
  private callbacks: DebatePanelCallbacks | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  show(task: TaskNode, workspaceSummary: string, callbacks: DebatePanelCallbacks): void {
    this.callbacks = callbacks;
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "planmyproject.debate",
        `Debate ${task.id}`,
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });

      this.panel.webview.onDidReceiveMessage(async (event) => {
        if (!this.callbacks) {
          return;
        }

        if (event?.type === "userMessage" && typeof event.message === "string") {
          await this.callbacks.onUserMessage(event.message);
          return;
        }

        if (event?.type === "action" && typeof event.action === "string") {
          const action = event.action as "accept" | "rewrite" | "split" | "dismiss" | "defer";
          await this.callbacks.onAction(action);
        }
      });
    }

    this.panel.title = `Debate ${task.id}`;
    this.panel.webview.html = renderDebateHtml(task, workspaceSummary);
    this.panel.reveal(vscode.ViewColumn.Beside, true);
  }

  postAssistantMessage(content: string): void {
    this.panel?.webview.postMessage({ type: "assistantMessage", content });
  }
}

function renderDebateHtml(task: TaskNode, workspaceSummary: string): string {
  const escapedTitle = escapeHtml(task.title);
  const escapedSummary = escapeHtml(workspaceSummary || "No scan summary available.");
  const escapedRationale = task.rationale ? escapeHtml(task.rationale) : "No rationale recorded.";
  const initialEntries = JSON.stringify(
    task.debateLog.map((entry) => ({
      role: entry.role,
      content: entry.content,
      timestamp: entry.timestamp,
      author: entry.author ?? ""
    }))
  ).replace(/</g, "\\u003c");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: var(--vscode-font-family); padding: 12px; color: var(--vscode-foreground); }
    .meta { opacity: 0.85; font-size: 12px; margin-bottom: 10px; }
    .summary { white-space: pre-wrap; border: 1px solid var(--vscode-panel-border); padding: 8px; border-radius: 6px; margin-bottom: 10px; }
    .rationale { white-space: pre-wrap; border-left: 3px solid var(--vscode-textLink-foreground); padding: 6px 8px; margin-bottom: 10px; opacity: 0.95; }
    #log { border: 1px solid var(--vscode-panel-border); border-radius: 6px; min-height: 180px; padding: 8px; margin-bottom: 10px; overflow: auto; }
    .entry { margin-bottom: 8px; white-space: pre-wrap; }
    textarea { width: 100%; min-height: 74px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 6px; }
    .actions { margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap; }
    button { border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 4px; padding: 4px 8px; cursor: pointer; }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  </style>
</head>
<body>
  <h3>🔍 ${task.id} — ${escapedTitle}</h3>
  <div class="meta">Goal: ${escapeHtml(task.goalRef ?? "none")} | Confidence: ${task.confidence !== null ? `${Math.round(task.confidence * 100)}%` : "n/a"}</div>
  <div class="rationale"><strong>Rationale:</strong> ${escapedRationale}</div>
  <div class="summary">${escapedSummary}</div>
  <div id="log"></div>
  <textarea id="message" placeholder="Challenge, refine, or clarify this task with PlanBot..."></textarea>
  <div class="actions">
    <button id="send">Send</button>
    <button data-action="accept" class="secondary">Accept</button>
    <button data-action="rewrite" class="secondary">Rewrite</button>
    <button data-action="split" class="secondary">Split</button>
    <button data-action="dismiss" class="secondary">Dismiss</button>
    <button data-action="defer" class="secondary">Defer</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const log = document.getElementById('log');
    const message = document.getElementById('message');
    const initialEntries = ${initialEntries};

    function append(role, content, metadata) {
      const item = document.createElement('div');
      item.className = 'entry';
      const suffix = metadata ? ' ' + metadata : '';
      const roleLabel = role === 'ai' ? 'PlanBot' : role === 'user' ? 'You' : 'System';
      item.textContent = '[' + roleLabel + ']' + suffix + ' ' + content;
      log.appendChild(item);
      log.scrollTop = log.scrollHeight;
    }

    for (const entry of initialEntries) {
      const meta = entry.timestamp ? '(' + entry.timestamp + (entry.author ? ' • ' + entry.author : '') + ')' : '';
      append(entry.role, entry.content, meta);
    }

    document.getElementById('send').addEventListener('click', () => {
      const text = message.value.trim();
      if (!text) return;
      append('user', text);
      vscode.postMessage({ type: 'userMessage', message: text });
      message.value = '';
    });

    for (const button of document.querySelectorAll('[data-action]')) {
      button.addEventListener('click', () => {
        const action = button.getAttribute('data-action');
        if (!action) return;
        append('system', 'Action requested: ' + action);
        vscode.postMessage({ type: 'action', action });
      });
    }

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'assistantMessage' && typeof event.data.content === 'string') {
        append('ai', event.data.content);
      }
    });
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
