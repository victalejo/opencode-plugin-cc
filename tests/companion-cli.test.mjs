import fs from "node:fs";
import os from "node:os";
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

test("opencode-companion refuses to run from inside opencode's own data directory", () => {
  const guardDir = path.join(os.tmpdir(), `opcguard-${Date.now()}`, ".local", "share", "opencode", "storage");
  fs.mkdirSync(guardDir, { recursive: true });

  const result = run("node", [COMPANION, "status", "--json"], { cwd: guardDir });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing to run opencode from inside its own data directory/);
  assert.match(result.stderr, /stale `cd`/);
});
