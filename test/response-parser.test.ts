import test from "node:test";
import assert from "node:assert/strict";
import { parseImplementationResponse, parseTaskGenerationResponse } from "../src/ai/ResponseParser";

test("parseTaskGenerationResponse validates and normalizes tasks", () => {
  const raw = JSON.stringify({
    tasks: [
      {
        title: "Evaluate auth storage",
        type: "research",
        rationale: "Need security tradeoff",
        goalCriterionIndex: 0,
        confidence: 0.82,
        dependsOnTitles: [],
        linkedFiles: ["src/auth/index.ts"]
      }
    ]
  });

  const parsed = parseTaskGenerationResponse(raw);
  assert.equal(parsed.tasks.length, 1);
  assert.equal(parsed.tasks[0].type, "research");
  assert.equal(parsed.tasks[0].confidence, 0.82);
});

test("parseImplementationResponse accepts fenced JSON", () => {
  const raw = [
    "```json",
    "{",
    "  \"summary\": \"Implemented auth middleware\",",
    "  \"taskCompleted\": true,",
    "  \"changes\": [{ \"path\": \"src/auth/middleware.ts\", \"content\": \"export const x = 1;\" }],",
    "  \"tests\": [\"npm test\"],",
    "  \"risks\": [\"none\"],",
    "  \"researchUsed\": [\"T0002: cookie strategy\"]",
    "}",
    "```"
  ].join("\n");

  const parsed = parseImplementationResponse(raw);
  assert.equal(parsed.taskCompleted, true);
  assert.equal(parsed.changes.length, 1);
  assert.equal(parsed.changes[0].path, "src/auth/middleware.ts");
});
