"use strict";

/**
 * P4-G2 — Feature coverage checker
 *
 * Reads FEATURE_CHECKLIST.json and verifies that every listed feature is
 * covered by a real, named test:
 *
 *  1. The test source file (testFile) must exist in the repository.
 *  2. The test name (testName) must appear as a string literal in that file.
 *  3. The compiled test file must exist in out-test/ (i.e. the project has
 *     been built since the test was written).
 *
 * Usage:
 *   node scripts/check-feature-coverage.js
 *
 * Exit code 0 = all checks passed. Non-zero = one or more checks failed.
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const CHECKLIST_PATH = path.join(ROOT, "FEATURE_CHECKLIST.json");
const PASS = "\x1b[32m✔\x1b[0m";
const FAIL = "\x1b[31m✖\x1b[0m";
const INFO = "\x1b[36mℹ\x1b[0m";

function loadChecklist() {
  if (!fs.existsSync(CHECKLIST_PATH)) {
    console.error(`${FAIL} FEATURE_CHECKLIST.json not found at ${CHECKLIST_PATH}`);
    process.exitCode = 1;
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(CHECKLIST_PATH, "utf8"));
  } catch (err) {
    console.error(`${FAIL} Failed to parse FEATURE_CHECKLIST.json: ${err.message}`);
    process.exitCode = 1;
    return [];
  }
}

/**
 * Given a test source path like "test/integration/integration.test.ts",
 * return the expected compiled path "out-test/test/integration/integration.test.js".
 */
function compiledPath(testFile) {
  const withoutExt = testFile.replace(/\.ts$/, ".js");
  return path.join(ROOT, "out-test", withoutExt);
}

function checkEntry(entry) {
  const { section, feature, testFile, testName } = entry;
  const label = `[${section}] ${feature}`;
  const errors = [];

  // 1 — source file exists
  const sourceAbs = path.join(ROOT, testFile);
  if (!fs.existsSync(sourceAbs)) {
    errors.push(`Source file not found: ${testFile}`);
  } else {
    // 2 — test name appears in source file
    const source = fs.readFileSync(sourceAbs, "utf8");
    if (!source.includes(testName)) {
      errors.push(`Test name not found in ${testFile}: "${testName}"`);
    }
  }

  // 3 — compiled file exists (build freshness check)
  const compiledAbs = compiledPath(testFile);
  if (!fs.existsSync(compiledAbs)) {
    errors.push(`Compiled file missing (run npm run test:build): ${compiledPath(testFile).replace(ROOT + "/", "")}`);
  }

  if (errors.length > 0) {
    console.log(`${FAIL} ${label}`);
    for (const error of errors) {
      console.log(`     ${error}`);
    }
    return false;
  }

  console.log(`${PASS} ${label}`);
  return true;
}

function main() {
  const checklist = loadChecklist();
  if (checklist.length === 0) {
    return;
  }

  console.log(`\n${INFO} Checking ${checklist.length} feature coverage entries...\n`);

  const bySection = new Map();
  for (const entry of checklist) {
    const section = entry.section ?? "Uncategorised";
    if (!bySection.has(section)) {
      bySection.set(section, []);
    }
    bySection.get(section).push(entry);
  }

  let passed = 0;
  let failed = 0;

  for (const [section, entries] of bySection) {
    console.log(`  ${section}`);
    for (const entry of entries) {
      const ok = checkEntry(entry);
      if (ok) {
        passed += 1;
      } else {
        failed += 1;
      }
    }
    console.log();
  }

  console.log(`${INFO} Results: ${passed} passed, ${failed} failed (${checklist.length} total)\n`);

  if (failed > 0) {
    console.error(
      `${FAIL} Feature coverage check failed — ${failed} feature(s) are missing or untested.\n` +
      `   Resolve the issues above and re-run: npm run check:coverage\n`
    );
    process.exitCode = 1;
  } else {
    console.log(`${PASS} All feature coverage checks passed.\n`);
  }
}

main();
