import test from "node:test";
import assert from "node:assert/strict";
import { resolveFileSendPolicy } from "../src/util";

const cases: Array<[string, "global" | "always" | "never" | "ask", boolean, "send" | "dont-send" | "ask"]> = [
  ["global false", "global", false, "dont-send"],
  ["global true", "global", true, "send"],
  ["always false", "always", false, "send"],
  ["always true", "always", true, "send"],
  ["never false", "never", false, "dont-send"],
  ["never true", "never", true, "dont-send"],
  ["ask false", "ask", false, "ask"],
  ["ask true", "ask", true, "ask"]
];

for (const [label, policy, globalSetting, expected] of cases) {
  test(`resolveFileSendPolicy ${label}`, () => {
    assert.equal(resolveFileSendPolicy(policy, globalSetting), expected);
  });
}
