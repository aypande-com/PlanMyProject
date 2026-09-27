"use strict";

/**
 * P0-D1 — Settings scope checker
 *
 * §12.4 of the v3 spec: every setting must declare an explicit `scope` so a
 * workspace-committed settings.json cannot silently weaken a safety or
 * egress control (unscoped defaults to `window`, which a workspace can set).
 * This fails the build the moment a new setting is added without one,
 * instead of relying on someone remembering to classify it.
 *
 * Usage:
 *   node scripts/check-settings-scope.js
 *
 * Exit code 0 = every setting has a valid scope. Non-zero = one or more do not.
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PACKAGE_JSON_PATH = path.join(ROOT, "package.json");
const PASS = "\x1b[32m✔\x1b[0m";
const FAIL = "\x1b[31m✖\x1b[0m";
const INFO = "\x1b[36mℹ\x1b[0m";

// https://code.visualstudio.com/api/references/contribution-points#contributes.configuration
const VALID_SCOPES = new Set(["application", "machine", "machine-overridable", "window", "resource", "language-overridable"]);

function main() {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
  const properties = pkg?.contributes?.configuration?.properties;

  if (!properties || typeof properties !== "object") {
    console.error(`${FAIL} No contributes.configuration.properties found in package.json`);
    process.exitCode = 1;
    return;
  }

  const keys = Object.keys(properties);
  console.log(`\n${INFO} Checking ${keys.length} setting(s) for an explicit scope...\n`);

  let passed = 0;
  let failed = 0;

  for (const key of keys) {
    const scope = properties[key].scope;
    if (typeof scope === "string" && VALID_SCOPES.has(scope)) {
      console.log(`${PASS} ${key} -> ${scope}`);
      passed += 1;
    } else if (scope === undefined) {
      console.log(`${FAIL} ${key} has no scope declared (defaults to window - see §12.4 before adding one)`);
      failed += 1;
    } else {
      console.log(`${FAIL} ${key} has an invalid scope: ${JSON.stringify(scope)}`);
      failed += 1;
    }
  }

  console.log(`\n${INFO} Results: ${passed} passed, ${failed} failed (${keys.length} total)\n`);

  if (failed > 0) {
    console.error(
      `${FAIL} Settings scope check failed - ${failed} setting(s) need an explicit scope.\n` +
      `   See PlanMyProject_v3_Spec.md §12.4 for the classification, then re-run: npm run check:settings-scope\n`
    );
    process.exitCode = 1;
  } else {
    console.log(`${PASS} All settings declare an explicit scope.\n`);
  }
}

main();
