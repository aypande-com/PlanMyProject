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

// P4-D2: these guards already existed in the parser but had no tests
// locking them in - a future refactor could silently regress any of them.

test("parseTaskGenerationResponse drops drafts with a blank title", () => {
  const raw = JSON.stringify({
    tasks: [
      { title: "   ", type: "implementation", rationale: "", goalCriterionIndex: 0, confidence: 0.8, dependsOnTitles: [], linkedFiles: [] },
      { title: "Real task", type: "implementation", rationale: "", goalCriterionIndex: 0, confidence: 0.8, dependsOnTitles: [], linkedFiles: [] }
    ]
  });

  const parsed = parseTaskGenerationResponse(raw);
  assert.equal(parsed.tasks.length, 1);
  assert.equal(parsed.tasks[0].title, "Real task");
});

test("parseTaskGenerationResponse clamps confidence to [0, 1]", () => {
  const raw = JSON.stringify({
    tasks: [
      { title: "Too high", type: "implementation", rationale: "", goalCriterionIndex: 0, confidence: 1.5, dependsOnTitles: [], linkedFiles: [] },
      { title: "Too low", type: "implementation", rationale: "", goalCriterionIndex: 0, confidence: -3, dependsOnTitles: [], linkedFiles: [] }
    ]
  });

  const parsed = parseTaskGenerationResponse(raw);
  assert.equal(parsed.tasks.find((t) => t.title === "Too high")?.confidence, 1);
  assert.equal(parsed.tasks.find((t) => t.title === "Too low")?.confidence, 0);
});

test("parseTaskGenerationResponse rejects an unknown type instead of defaulting it", () => {
  const raw = JSON.stringify({
    tasks: [
      { title: "Bogus type", type: "not-a-real-type", rationale: "", goalCriterionIndex: 0, confidence: 0.8, dependsOnTitles: [], linkedFiles: [] },
      { title: "Valid type", type: "decision", rationale: "", goalCriterionIndex: 0, confidence: 0.8, dependsOnTitles: [], linkedFiles: [] }
    ]
  });

  const parsed = parseTaskGenerationResponse(raw);
  assert.equal(parsed.tasks.length, 1, "the bogus-type draft must be dropped, not defaulted to implementation");
  assert.equal(parsed.tasks[0].title, "Valid type");
});

// P4-D1: goalCriterionIndex bounds validation against the real goal.

test("parseTaskGenerationResponse downgrades confidence for an out-of-range goalCriterionIndex", () => {
  const raw = JSON.stringify({
    tasks: [
      { title: "Out of range", type: "implementation", rationale: "", goalCriterionIndex: 5, confidence: 0.8, dependsOnTitles: [], linkedFiles: [] }
    ]
  });

  const parsed = parseTaskGenerationResponse(raw, { goalCriteriaCount: 2 });
  assert.ok(
    Math.abs(parsed.tasks[0].confidence - 0.6) < 1e-9,
    `0.8 - 0.2 penalty for an index outside the goal's 2 criteria, got ${parsed.tasks[0].confidence}`
  );
});

test("parseTaskGenerationResponse leaves confidence alone for a valid goalCriterionIndex", () => {
  const raw = JSON.stringify({
    tasks: [
      { title: "In range", type: "implementation", rationale: "", goalCriterionIndex: 1, confidence: 0.8, dependsOnTitles: [], linkedFiles: [] }
    ]
  });

  const parsed = parseTaskGenerationResponse(raw, { goalCriteriaCount: 2 });
  assert.equal(parsed.tasks[0].confidence, 0.8);
});

test("parseTaskGenerationResponse downgrades every task when the goal has no criteria at all", () => {
  const raw = JSON.stringify({
    tasks: [
      { title: "No criteria to reference", type: "implementation", rationale: "", goalCriterionIndex: 0, confidence: 0.8, dependsOnTitles: [], linkedFiles: [] }
    ]
  });

  const parsed = parseTaskGenerationResponse(raw, { goalCriteriaCount: 0 });
  assert.ok(
    Math.abs(parsed.tasks[0].confidence - 0.6) < 1e-9,
    `index 0 is out of range when there are zero criteria to index into, got ${parsed.tasks[0].confidence}`
  );
});

test("parseTaskGenerationResponse does not apply the goal-criterion penalty when goalCriteriaCount is not passed", () => {
  const raw = JSON.stringify({
    tasks: [
      { title: "No validation requested", type: "implementation", rationale: "", goalCriterionIndex: 99, confidence: 0.8, dependsOnTitles: [], linkedFiles: [] }
    ]
  });

  const parsed = parseTaskGenerationResponse(raw);
  assert.equal(parsed.tasks[0].confidence, 0.8, "backward-compatible: callers that omit the option get the old behavior");
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
