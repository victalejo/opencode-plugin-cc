import test from "node:test";
import assert from "node:assert/strict";

import {
  parseStructuredOutput,
  parseStreamLine,
  buildPersistentTaskSessionName,
  DEFAULT_CONTINUE_PROMPT,
  getOpencodeAvailability,
  getSessionRuntimeStatus
} from "../plugins/opencode/scripts/lib/opencode.mjs";

function emptyCapture() {
  return {
    sessionId: null,
    lastMessageId: null,
    textParts: [],
    touchedFiles: new Set(),
    errors: [],
    lastTokens: null
  };
}

test("buildPersistentTaskSessionName produces a deterministic prefix and excerpt", () => {
  const name = buildPersistentTaskSessionName("rescue the failing build pipeline");
  assert.match(name, /^Opencode Companion Task: rescue the failing build pipeline$/);
});

test("buildPersistentTaskSessionName truncates long prompts with an ellipsis", () => {
  const name = buildPersistentTaskSessionName("a".repeat(200));
  assert.match(name, /^Opencode Companion Task: a{1,}\.\.\./);
  assert.ok(name.length <= 100);
});

test("buildPersistentTaskSessionName falls back to the bare prefix on empty prompts", () => {
  assert.equal(buildPersistentTaskSessionName(""), "Opencode Companion Task");
  assert.equal(buildPersistentTaskSessionName(null), "Opencode Companion Task");
});

test("parseStructuredOutput recovers JSON embedded in markdown code fences", () => {
  const text = "Reasoning...\n```json\n{\"verdict\":\"approve\",\"summary\":\"ok\"}\n```\n";
  const result = parseStructuredOutput(text);
  assert.deepEqual(result.parsed, { verdict: "approve", summary: "ok" });
  assert.equal(result.parseError, null);
});

test("parseStructuredOutput reports parse errors for non-JSON output", () => {
  const result = parseStructuredOutput("not json at all");
  assert.equal(result.parsed, null);
  assert.match(result.parseError, /Could not parse/);
});

test("parseStructuredOutput surfaces fallback message on empty output", () => {
  const result = parseStructuredOutput("", { failureMessage: "boom" });
  assert.equal(result.parsed, null);
  assert.equal(result.parseError, "boom");
});

test("DEFAULT_CONTINUE_PROMPT is a non-empty string", () => {
  assert.equal(typeof DEFAULT_CONTINUE_PROMPT, "string");
  assert.ok(DEFAULT_CONTINUE_PROMPT.length > 0);
});

test("getOpencodeAvailability reports when the binary is missing", () => {
  const previous = process.env.OPENCODE_BIN;
  process.env.OPENCODE_BIN = "definitely-not-opencode-on-path";
  try {
    const result = getOpencodeAvailability(process.cwd());
    assert.equal(result.available, false);
    assert.ok(result.detail);
  } finally {
    if (previous == null) {
      delete process.env.OPENCODE_BIN;
    } else {
      process.env.OPENCODE_BIN = previous;
    }
  }
});

test("getSessionRuntimeStatus reports direct mode without OPENCODE_SERVER_URL", () => {
  const status = getSessionRuntimeStatus({}, process.cwd());
  assert.equal(status.mode, "direct");
  assert.equal(status.endpoint, null);
});

test("getSessionRuntimeStatus reports shared mode when OPENCODE_SERVER_URL is set", () => {
  const status = getSessionRuntimeStatus({ OPENCODE_SERVER_URL: "http://127.0.0.1:4096" }, process.cwd());
  assert.equal(status.mode, "shared");
  assert.equal(status.endpoint, "http://127.0.0.1:4096");
});

test("parseStreamLine captures filePath from opencode 1.4.x write tool events", () => {
  const capture = emptyCapture();
  const realEvent = {
    type: "tool_use",
    sessionID: "ses_abc",
    part: {
      type: "tool",
      tool: "write",
      messageID: "msg_xyz",
      state: {
        status: "completed",
        input: {
          content: "hi",
          filePath: "C:\\workspace\\hello.txt"
        },
        output: "Wrote file successfully."
      }
    }
  };
  parseStreamLine(JSON.stringify(realEvent), capture);
  assert.deepEqual([...capture.touchedFiles], ["C:\\workspace\\hello.txt"]);
  assert.equal(capture.sessionId, "ses_abc");
  assert.equal(capture.lastMessageId, "msg_xyz");
});

test("parseStreamLine captures filePath from edit and multiedit tools too", () => {
  const capture = emptyCapture();
  parseStreamLine(
    JSON.stringify({
      type: "tool_use",
      part: { tool: "edit", state: { input: { filePath: "/abs/a.js" } } }
    }),
    capture
  );
  parseStreamLine(
    JSON.stringify({
      type: "tool_use",
      part: { tool: "multiedit", state: { input: { filePath: "/abs/b.js" } } }
    }),
    capture
  );
  assert.deepEqual([...capture.touchedFiles].sort(), ["/abs/a.js", "/abs/b.js"]);
});

test("parseStreamLine accumulates assistant text and step_finish tokens", () => {
  const capture = emptyCapture();
  parseStreamLine(
    JSON.stringify({ type: "text", part: { text: "Hello " } }),
    capture
  );
  parseStreamLine(
    JSON.stringify({ type: "text", part: { text: "world." } }),
    capture
  );
  parseStreamLine(
    JSON.stringify({
      type: "step_finish",
      part: { tokens: { total: 9077, input: 8995, output: 82 } }
    }),
    capture
  );
  assert.equal(capture.textParts.join(""), "Hello world.");
  assert.equal(capture.lastTokens.input, 8995);
  assert.equal(capture.lastTokens.output, 82);
});

test("parseStreamLine tolerates dash-cased event types (step-start/step-finish)", () => {
  const capture = emptyCapture();
  parseStreamLine(
    JSON.stringify({ type: "step-finish", part: { tokens: { input: 1, output: 2 } } }),
    capture
  );
  assert.deepEqual(capture.lastTokens, { input: 1, output: 2 });
});

test("parseStreamLine silently ignores malformed JSON lines", () => {
  const capture = emptyCapture();
  parseStreamLine("not json", capture);
  parseStreamLine("", capture);
  assert.equal(capture.textParts.length, 0);
  assert.equal(capture.touchedFiles.size, 0);
});
