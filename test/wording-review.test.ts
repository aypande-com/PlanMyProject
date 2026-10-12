import test from "node:test";
import assert from "node:assert/strict";
import {
  collectWordingReviewItems,
  applyWordingReviewItem,
  wordingItemLabel,
  wordingItemDetail
} from "../src/controller/GoalCommandService";
import { parseWordingReviewResponse, type WordingReviewInput } from "../src/ai/ResponseParser";

const INPUT: WordingReviewInput = {
  statement: "Web based diver game to find under water trasures",
  successCriteria: ["Ofline but runs in browser"],
  constraints: [],
  outOfScope: []
};

test("parseWordingReviewResponse applies a spelling fix and carries an ambiguity note through", () => {
  const raw = JSON.stringify({
    statement: {
      corrected: "Web based diver game to find underwater treasures",
      notes: []
    },
    successCriteria: [
      { corrected: "Offline but runs in browser", notes: [] }
    ],
    constraints: [],
    outOfScope: []
  });

  const review = parseWordingReviewResponse(raw, INPUT);
  assert.equal(review.statement.corrected, "Web based diver game to find underwater treasures");
  assert.equal(review.successCriteria[0].corrected, "Offline but runs in browser");
});

test("parseWordingReviewResponse falls back to the original text when the AI response is unparseable", () => {
  const review = parseWordingReviewResponse("not json at all", INPUT);
  assert.equal(review.statement.corrected, INPUT.statement);
  assert.equal(review.successCriteria[0].corrected, INPUT.successCriteria[0]);
  assert.deepEqual(review.statement.notes, []);
});

// P0-style defensive parsing: if an array-shaped field comes back a
// different length than the input (AI dropped or added a line), pairing it
// up positionally would silently attach a correction to the wrong criterion.
// Treating it as unusable and falling back to originals is the safe default.
test("parseWordingReviewResponse falls back for a field whose array length doesn't match the input", () => {
  const raw = JSON.stringify({
    statement: { corrected: INPUT.statement, notes: [] },
    successCriteria: [
      { corrected: "Offline but runs in browser", notes: [] },
      { corrected: "an extra unexpected line", notes: [] }
    ],
    constraints: [],
    outOfScope: []
  });

  const review = parseWordingReviewResponse(raw, INPUT);
  assert.equal(review.successCriteria.length, 1, "must match the input length, not the response length");
  assert.equal(review.successCriteria[0].corrected, INPUT.successCriteria[0], "mismatched array falls back to originals verbatim");
});

test("parseWordingReviewResponse keeps a vague-wording note even when no spelling fix is needed", () => {
  const raw = JSON.stringify({
    statement: {
      corrected: INPUT.statement,
      notes: [{ phrase: "fast", reason: "not measurable", suggestion: "loads in under 2 seconds" }]
    },
    successCriteria: [{ corrected: INPUT.successCriteria[0], notes: [] }],
    constraints: [],
    outOfScope: []
  });

  const review = parseWordingReviewResponse(raw, INPUT);
  assert.equal(review.statement.corrected, INPUT.statement);
  assert.equal(review.statement.notes.length, 1);
  assert.equal(review.statement.notes[0].phrase, "fast");
  assert.equal(review.statement.notes[0].suggestion, "loads in under 2 seconds");
});

test("collectWordingReviewItems only surfaces lines with an actual spelling fix or a note", () => {
  const review = parseWordingReviewResponse(
    JSON.stringify({
      statement: { corrected: "Web based diver game to find underwater treasures", notes: [] },
      successCriteria: [{ corrected: INPUT.successCriteria[0], notes: [] }],
      constraints: [],
      outOfScope: []
    }),
    INPUT
  );

  const items = collectWordingReviewItems(INPUT, review);
  assert.equal(items.length, 1, "only the statement changed; the untouched criterion must not appear");
  assert.equal(items[0].field, "statement");
  assert.equal(items[0].corrected, "Web based diver game to find underwater treasures");
});

test("collectWordingReviewItems returns nothing when the review made no changes and raised no notes", () => {
  const review = parseWordingReviewResponse("garbage", INPUT);
  const items = collectWordingReviewItems(INPUT, review);
  assert.deepEqual(items, []);
});

test("applyWordingReviewItem rewrites only the targeted field/index, leaving the rest of the draft untouched", () => {
  const input: WordingReviewInput = {
    statement: "Statement",
    successCriteria: ["First", "Second"],
    constraints: ["Only constraint"],
    outOfScope: []
  };

  const next = applyWordingReviewItem(
    input,
    { field: "successCriteria", index: 1, original: "Second", corrected: "Second (fixed)", notes: [] },
    "Second (fixed)"
  );

  assert.equal(next.successCriteria[1], "Second (fixed)");
  assert.equal(next.successCriteria[0], "First", "sibling array entries must be untouched");
  assert.equal(next.statement, input.statement);
  assert.notEqual(next, input, "must not mutate the original draft in place");
  assert.equal(input.successCriteria[1], "Second", "original draft stays unchanged");
});

test("wordingItemLabel and wordingItemDetail describe a spelling fix vs a vague-wording note differently", () => {
  const spellingItem = { field: "statement" as const, index: 0, original: "trasures", corrected: "treasures", notes: [] };
  assert.equal(wordingItemLabel(spellingItem), "Statement");
  assert.match(wordingItemDetail(spellingItem), /trasures.*treasures/);

  const vagueItem = {
    field: "successCriteria" as const,
    index: 0,
    original: "it should be fast",
    corrected: "it should be fast",
    notes: [{ phrase: "fast", reason: "not measurable", suggestion: "under 2s" }]
  };
  assert.equal(wordingItemLabel(vagueItem), "Success criterion 1");
  assert.match(wordingItemDetail(vagueItem), /fast.*not measurable.*under 2s/);
});
