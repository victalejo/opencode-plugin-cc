import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { run } from "./helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPANION = path.join(ROOT, "plugins", "opencode", "scripts", "opencode-companion.mjs");

test("opencode-companion --help prints usage with the renamed subcommands", () => {
  const result = run("node", [COMPANION, "--help"], { cwd: ROOT });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /opencode-companion\.mjs setup/);
  assert.match(result.stdout, /opencode-companion\.mjs review/);
  assert.match(result.stdout, /opencode-companion\.mjs adversarial-review/);
  assert.match(result.stdout, /opencode-companion\.mjs task/);
  assert.match(result.stdout, /opencode-companion\.mjs status/);
  assert.match(result.stdout, /opencode-companion\.mjs result/);
  assert.match(result.stdout, /opencode-companion\.mjs cancel/);
  assert.doesNotMatch(result.stdout, /--effort/);
  assert.doesNotMatch(result.stdout, /spark/i);
});

test("opencode-companion rejects unknown subcommands with exit 1", () => {
  const result = run("node", [COMPANION, "definitely-not-a-subcommand"], { cwd: ROOT });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown subcommand/);
});
