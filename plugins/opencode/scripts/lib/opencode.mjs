/**
 * High-level helpers that drive a local `opencode` CLI instance.
 *
 * Each turn shells out to `opencode run --format json ...` which streams
 * JSONL events (`step_start`, `text`, `step_finish`, `tool_*`) and exits
 * with the assistant's final state. Output is captured, the assistant
 * text reassembled, and the session id surfaced so jobs can be resumed
 * later via `opencode run --continue --session <id>`.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

import { binaryAvailable, runCommand } from "./process.mjs";

const SERVICE_NAME = "opencode_plugin_cc";
const TASK_SESSION_PREFIX = "Opencode Companion Task";
const DEFAULT_CONTINUE_PROMPT =
  "Continue from the current session state. Pick the next highest-value step and follow through until the task is resolved.";

const OPENCODE_AUTH_FILES = [
  path.join(os.homedir(), ".local", "share", "opencode", "auth.json"),
  path.join(os.homedir(), ".config", "opencode", "auth.json")
];

function opencodeBin() {
  return process.env.OPENCODE_BIN || "opencode";
}

function shorten(text, limit = 72) {
  const normalized = String(text ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 3)}...`;
}

export function buildPersistentTaskSessionName(prompt) {
  const excerpt = shorten(prompt, 56);
  return excerpt ? `${TASK_SESSION_PREFIX}: ${excerpt}` : TASK_SESSION_PREFIX;
}

export function getOpencodeAvailability(cwd = process.cwd()) {
  const probe = binaryAvailable(opencodeBin(), ["--version"], { cwd });
  if (!probe.available) {
    return {
      available: false,
      version: null,
      detail: probe.detail ?? "opencode CLI is not on PATH."
    };
  }
  return {
    available: true,
    version: probe.detail ?? null,
    detail: null
  };
}

export function getSessionRuntimeStatus(env = process.env, cwd = process.cwd()) {
  const url = env?.OPENCODE_SERVER_URL ?? null;
  if (url) {
    return {
      mode: "shared",
      label: "shared session",
      detail: `Attaching to opencode server at ${url}.`,
      endpoint: url
    };
  }
  return {
    mode: "direct",
    label: "direct session",
    detail: "Each command spawns a fresh `opencode run` process.",
    endpoint: null
  };
}

function detectAuthFromDisk() {
  for (const file of OPENCODE_AUTH_FILES) {
    if (fs.existsSync(file)) {
      try {
        const payload = JSON.parse(fs.readFileSync(file, "utf8"));
        const providers = Object.keys(payload ?? {});
        if (providers.length > 0) {
          return { loggedIn: true, providers, file };
        }
      } catch {
        // fallthrough
      }
    }
  }
  return { loggedIn: false, providers: [], file: null };
}

function stripAnsi(text) {
  return String(text ?? "").replace(/\[[0-9;]*[A-Za-z]/g, "");
}

export async function getOpencodeAuthStatus(cwd = process.cwd()) {
  if (!getOpencodeAvailability(cwd).available) {
    return {
      loggedIn: false,
      providers: [],
      requiresOpenaiAuth: false,
      detail: "opencode CLI is not installed."
    };
  }

  const probe = runCommand(opencodeBin(), ["auth", "list"], { cwd });
  if (probe.status === 0 && probe.stdout) {
    const providers = stripAnsi(probe.stdout)
      .split(/\r?\n/)
      .map((line) => line.replace(/^[│┌└●\s]+/, "").trim())
      .filter(Boolean)
      .filter((line) => !/^credentials/i.test(line))
      .filter((line) => !/^\d+\s+credentials?$/i.test(line))
      .filter((line) => !/no providers/i.test(line));
    if (providers.length > 0) {
      return {
        loggedIn: true,
        providers,
        requiresOpenaiAuth: false,
        detail: null
      };
    }
  }

  const disk = detectAuthFromDisk();
  if (disk.loggedIn) {
    return {
      loggedIn: true,
      providers: disk.providers,
      requiresOpenaiAuth: false,
      detail: null
    };
  }

  return {
    loggedIn: false,
    providers: [],
    requiresOpenaiAuth: false,
    detail: "No opencode providers configured. Run `!opencode auth login`."
  };
}

function reportProgress(onProgress, payload) {
  if (typeof onProgress !== "function") return;
  try {
    onProgress(payload);
  } catch {
    // Ignore progress sink errors so they cannot break the run.
  }
}

function buildRunArgs(options) {
  const args = ["run", "--format", "json"];
  if (options.resumeSessionId) {
    args.push("--continue", "--session", options.resumeSessionId);
  } else if (options.sessionName) {
    args.push("--title", options.sessionName);
  }
  if (options.model) {
    args.push("--model", options.model);
  }
  if (options.agent) {
    args.push("--agent", options.agent);
  }
  if (options.write) {
    args.push("--dangerously-skip-permissions");
  }
  return args;
}

function isWindows() {
  return process.platform === "win32";
}

function spawnOpencodeRun(cwd, args, env) {
  return spawn(opencodeBin(), args, {
    cwd,
    env: env ?? process.env,
    stdio: ["pipe", "pipe", "pipe"],
    shell: isWindows(),
    windowsHide: true
  });
}

export function parseStreamLine(line, capture) {
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return;
  }
  if (!event || typeof event !== "object") return;

  const type = String(event.type ?? "").replace(/-/g, "_");

  if (event.sessionID && !capture.sessionId) {
    capture.sessionId = event.sessionID;
  }
  if (event.part?.messageID) {
    capture.lastMessageId = event.part.messageID;
  }
  if (type === "text" && typeof event.part?.text === "string") {
    capture.textParts.push(event.part.text);
  }
  if (type === "step_finish" && event.part?.tokens) {
    capture.lastTokens = event.part.tokens;
  }
  if (type === "tool_call" || type === "tool_use" || type === "tool") {
    const part = event.part ?? {};
    const tool = part.tool ?? part.name;
    const input = part.state?.input ?? part.input ?? part.args ?? {};
    const filePath =
      input.filePath ??
      input.file_path ??
      input.path ??
      part.state?.metadata?.filepath ??
      part.metadata?.filepath ??
      null;
    if ((tool === "edit" || tool === "write" || tool === "multiedit" || tool === "patch") && filePath) {
      capture.touchedFiles.add(filePath);
    }
  }
  if (type === "error" && event.part?.message) {
    capture.errors.push(event.part.message);
  }
}

/**
 * Run a single opencode turn. Streams `opencode run --format json` and
 * returns the assistant text, session id, and metadata.
 */
export async function runOpencodeTurn(cwd, options = {}) {
  const availability = getOpencodeAvailability(cwd);
  if (!availability.available) {
    return {
      status: 127,
      threadId: null,
      turnId: null,
      finalMessage: "",
      stderr: availability.detail ?? "opencode CLI is not on PATH.",
      error: new Error(availability.detail ?? "opencode missing"),
      touchedFiles: [],
      reasoningSummary: []
    };
  }

  const prompt = options.prompt?.trim() ? options.prompt : options.defaultPrompt ?? "";
  if (!prompt) {
    return {
      status: 1,
      threadId: null,
      turnId: null,
      finalMessage: "",
      stderr: "Refusing to send an empty opencode turn.",
      error: new Error("empty prompt"),
      touchedFiles: [],
      reasoningSummary: []
    };
  }

  const args = buildRunArgs(options);

  reportProgress(options.onProgress, {
    message: options.resumeSessionId
      ? `Resuming opencode session ${options.resumeSessionId}`
      : "Starting opencode session...",
    phase: "turn.start",
    threadId: options.resumeSessionId ?? null
  });

  const capture = {
    sessionId: options.resumeSessionId ?? null,
    lastMessageId: null,
    textParts: [],
    touchedFiles: new Set(),
    errors: [],
    lastTokens: null
  };

  const child = spawnOpencodeRun(cwd, args, options.env);
  let stdoutBuffer = "";
  let stderrBuffer = "";

  if (child.stdin) {
    child.stdin.write(prompt);
    if (!prompt.endsWith("\n")) child.stdin.write("\n");
    child.stdin.end();
  }
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    let newlineIndex = stdoutBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (line) parseStreamLine(line, capture);
      newlineIndex = stdoutBuffer.indexOf("\n");
    }
  });
  child.stderr.on("data", (chunk) => {
    stderrBuffer += chunk;
  });

  const exitInfo = await new Promise((resolve) => {
    child.on("close", (code, signal) => resolve({ code, signal }));
    child.on("error", (error) => resolve({ code: 1, signal: null, error }));
  });

  if (stdoutBuffer.trim()) {
    parseStreamLine(stdoutBuffer.trim(), capture);
  }

  const finalMessage = capture.textParts.join("").trim();
  const status = exitInfo.code ?? (exitInfo.error ? 1 : 0);
  const errorMessage = exitInfo.error?.message
    ?? (capture.errors.length > 0 ? capture.errors.join("\n") : null);

  reportProgress(options.onProgress, {
    message: status === 0 ? "Turn completed." : `Turn failed (exit ${status}).`,
    phase: status === 0 ? "turn.completed" : "turn.error",
    threadId: capture.sessionId,
    turnId: capture.lastMessageId,
    stderrMessage: stripAnsi(stderrBuffer).trim() || errorMessage
  });

  return {
    status,
    threadId: capture.sessionId,
    turnId: capture.lastMessageId,
    finalMessage,
    stderr: stripAnsi(stderrBuffer).trim(),
    error: exitInfo.error ?? (capture.errors.length > 0 ? new Error(capture.errors[0]) : null),
    touchedFiles: [...capture.touchedFiles],
    reasoningSummary: [],
    tokens: capture.lastTokens
  };
}

export async function runOpencodeReview(cwd, options = {}) {
  const result = await runOpencodeTurn(cwd, options);
  return {
    status: result.status,
    threadId: result.threadId,
    sourceThreadId: result.threadId,
    turnId: result.turnId,
    reviewText: result.finalMessage,
    stderr: result.stderr,
    reasoningSummary: result.reasoningSummary
  };
}

export async function interruptOpencodeTurn(cwd, { threadId } = {}) {
  if (!threadId) {
    return { attempted: false, interrupted: false, detail: "No session id provided." };
  }
  const probe = runCommand(opencodeBin(), ["session", "delete", threadId], { cwd });
  if (probe.status === 0) {
    return { attempted: true, interrupted: true, detail: null };
  }
  return {
    attempted: true,
    interrupted: false,
    detail: stripAnsi(probe.stderr || probe.stdout || "").trim() || `exit ${probe.status}`
  };
}

export async function findLatestTaskSession(cwd) {
  const probe = runCommand(opencodeBin(), ["session", "list"], { cwd });
  if (probe.status !== 0 || !probe.stdout) return null;
  const stripped = stripAnsi(probe.stdout);
  const match = stripped
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => line.includes(TASK_SESSION_PREFIX));
  if (!match) return null;
  const idMatch = match.match(/(ses_[a-zA-Z0-9_-]+)/);
  if (!idMatch) return null;
  return { id: idMatch[1] };
}

export function parseStructuredOutput(rawOutput, fallback = {}) {
  const text = typeof rawOutput === "string" ? rawOutput.trim() : "";
  if (!text) {
    return {
      parsed: null,
      rawOutput: text,
      parseError: fallback.failureMessage || "opencode returned no output."
    };
  }

  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = jsonBlockMatch ? jsonBlockMatch[1].trim() : text;

  try {
    return {
      parsed: JSON.parse(candidate),
      rawOutput: text,
      parseError: null
    };
  } catch (error) {
    return {
      parsed: null,
      rawOutput: text,
      parseError: `Could not parse structured output: ${error.message}`
    };
  }
}

export function readOutputSchema(schemaPath) {
  if (!schemaPath || !fs.existsSync(schemaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  } catch {
    return null;
  }
}

export { DEFAULT_CONTINUE_PROMPT, TASK_SESSION_PREFIX, SERVICE_NAME };
