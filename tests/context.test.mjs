import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { makeTempDir } from "./helpers.mjs";
import {
  assemblePromptWithContext,
  formatContextBlock,
  parseContextSpec,
  readContextFiles
} from "../plugins/opencode/scripts/lib/context.mjs";

test("parseContextSpec splits on comma, trims, drops empties", () => {
  assert.deepEqual(parseContextSpec(null), []);
  assert.deepEqual(parseContextSpec(""), []);
  assert.deepEqual(parseContextSpec("a.ts"), ["a.ts"]);
  assert.deepEqual(parseContextSpec(" a.ts , b.ts ,, c.ts "), ["a.ts", "b.ts", "c.ts"]);
});

test("readContextFiles returns [] when no spec is provided", () => {
  const cwd = makeTempDir();
  assert.deepEqual(readContextFiles(cwd, null), []);
  assert.deepEqual(readContextFiles(cwd, ""), []);
});

test("readContextFiles reads UTF-8 file contents relative to cwd", () => {
  const cwd = makeTempDir();
  fs.writeFileSync(path.join(cwd, "alpha.txt"), "hello\n");
  fs.mkdirSync(path.join(cwd, "sub"));
  fs.writeFileSync(path.join(cwd, "sub", "beta.txt"), "world");

  const files = readContextFiles(cwd, "alpha.txt, sub/beta.txt");
  assert.deepEqual(files, [
    { path: "alpha.txt", content: "hello\n" },
    { path: "sub/beta.txt", content: "world" }
  ]);
});

test("readContextFiles throws a clear error when a file is missing", () => {
  const cwd = makeTempDir();
  assert.throws(() => readContextFiles(cwd, "does-not-exist.ts"), /--context file not found: does-not-exist\.ts/);
});

test("readContextFiles rejects directories", () => {
  const cwd = makeTempDir();
  fs.mkdirSync(path.join(cwd, "somedir"));
  assert.throws(() => readContextFiles(cwd, "somedir"), /expects files, got directory: somedir/);
});

test("formatContextBlock returns empty string when given empty input", () => {
  assert.equal(formatContextBlock(null), "");
  assert.equal(formatContextBlock([]), "");
});

test("formatContextBlock renders files with explicit markers and trailing newline", () => {
  const block = formatContextBlock([
    { path: "a.ts", content: "const a = 1;\n" },
    { path: "b.ts", content: "const b = 2;" }
  ]);
  assert.match(block, /^=== Context files \(provided via --context/);
  assert.match(block, /--- a\.ts ---\nconst a = 1;\n/);
  assert.match(block, /--- b\.ts ---\nconst b = 2;\n/);
  assert.match(block, /=== End of context files ===/);
});

test("assemblePromptWithContext leaves the prompt untouched when no context is provided", () => {
  assert.equal(assemblePromptWithContext("do the thing", null), "do the thing");
  assert.equal(assemblePromptWithContext("do the thing", []), "do the thing");
});

test("assemblePromptWithContext prepends the context block before the prompt", () => {
  const out = assemblePromptWithContext("fix the bug", [{ path: "a.ts", content: "x" }]);
  assert.match(out, /^=== Context files/);
  assert.match(out, /fix the bug$/);
  // The user's prompt must come after the closing marker, not inside the block.
  const closingIndex = out.indexOf("=== End of context files ===");
  const promptIndex = out.indexOf("fix the bug");
  assert.ok(closingIndex >= 0 && promptIndex > closingIndex);
});
