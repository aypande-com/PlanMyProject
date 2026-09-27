"use strict";

// P0-C2: bundles the extension into a single out/extension.js instead of the
// unbundled per-module output tsc produces (one .js file per .ts file, all
// shipped in the VSIX today). `vscode` stays external - it is provided by
// the host at runtime and does not exist as an installable module.

const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

const buildOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "out/extension.js",
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  external: ["vscode"],
  logLevel: "info"
};

async function main() {
  if (watch) {
    const context = await esbuild.context(buildOptions);
    await context.watch();
    console.log("[esbuild] watching for changes...");
    return;
  }

  await esbuild.build(buildOptions);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
