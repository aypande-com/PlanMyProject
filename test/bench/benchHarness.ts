import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import * as fs from "node:fs";
import * as path from "node:path";

// P0-C1: a single cold timing sample is dominated by one-time V8 JIT/inline-
// cache warm-up, not the algorithm being measured (see queue.bench.ts for the
// concrete numbers that led here). This harness runs warm-up iterations
// un-timed, then reports the minimum of several timed samples - minimum
// rather than median because median-of-5-after-3-warmup measured 7ms-23ms
// across repeated runs on the same fixture on this machine, while minimum
// consistently landed 6ms-13ms; a CI runner is typically noisier than a dev
// machine, so the more stable statistic is the safer one to gate on.

export interface BenchSample {
  name: string;
  minMs: number;
  medianMs: number;
  samplesMs: number[];
}

export function measure(name: string, fn: () => void, options?: { warmupRuns?: number; sampleRuns?: number }): BenchSample {
  const warmupRuns = options?.warmupRuns ?? 3;
  const sampleRuns = options?.sampleRuns ?? 5;

  for (let i = 0; i < warmupRuns; i += 1) {
    fn();
  }

  const samplesMs: number[] = [];
  for (let i = 0; i < sampleRuns; i += 1) {
    const start = performance.now();
    fn();
    samplesMs.push(performance.now() - start);
  }

  const sorted = [...samplesMs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return { name, minMs: sorted[0], medianMs, samplesMs };
}

interface BaselineEntry {
  baselineMs: number;
  tolerance: number;
  note?: string;
}

type BaselineFile = Record<string, BaselineEntry>;

const BASELINE_PATH = path.join(__dirname, "..", "..", "..", "test", "bench", "baseline.json");

function loadBaseline(): BaselineFile {
  const raw = fs.readFileSync(BASELINE_PATH, "utf8");
  return JSON.parse(raw) as BaselineFile;
}

// Compares against a committed baseline with a tolerance band rather than a
// hard constant (§14.4 / U5's own description) - a hard constant makes every
// run on a slower CI runner a false failure; a baseline + multiplier still
// catches a real regression (going super-linear again would blow well past
// any reasonable multiplier) without being tied to one machine's noise floor.
export function assertWithinBaseline(sample: BenchSample): void {
  const baseline = loadBaseline();
  const entry = baseline[sample.name];
  assert.ok(entry, `No committed baseline for "${sample.name}" in test/bench/baseline.json`);

  const budgetMs = entry.baselineMs * entry.tolerance;
  console.log(
    `[bench] ${sample.name}: min=${sample.minMs.toFixed(2)}ms median=${sample.medianMs.toFixed(2)}ms ` +
      `budget=${budgetMs.toFixed(2)}ms (baseline ${entry.baselineMs}ms x ${entry.tolerance})`
  );

  assert.ok(
    sample.minMs <= budgetMs,
    `${sample.name}: best of ${sample.samplesMs.length} post-warm-up runs was ${sample.minMs.toFixed(2)}ms, ` +
      `budget is ${budgetMs.toFixed(2)}ms (committed baseline ${entry.baselineMs}ms x ${entry.tolerance} tolerance)`
  );
}
