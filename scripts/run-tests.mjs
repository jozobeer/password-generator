import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

/** Round 2: empty file counts as tests 1, so the floor must be well above 1. */
const MIN_TESTS = 42;

let entries;
try {
  entries = readdirSync("test");
} catch {
  console.error("run-tests: test/ directory is missing");
  process.exit(1);
}

const testFiles = entries
  .filter((name) => name.endsWith(".test.mjs"))
  .map((name) => join("test", name))
  .sort();

if (testFiles.length === 0) {
  console.error("run-tests: no *.test.mjs files found in test/");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  encoding: "utf8",
  env: { ...process.env, FORCE_COLOR: "0" },
});

const stdout = result.stdout ?? "";
const stderr = result.stderr ?? "";
if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr);

const combined = stdout + stderr;
const match = combined.match(/ℹ tests\s+(\d+)/);
if (!match) {
  console.error("run-tests: could not parse test count from runner output");
  process.exit(1);
}

const testCount = Number(match[1]);
if (testCount < MIN_TESTS) {
  console.error(
    `run-tests: expected at least ${MIN_TESTS} tests, got ${testCount}`,
  );
  process.exit(1);
}

if (result.status !== 0 && result.status != null) {
  process.exit(result.status);
}
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(0);
