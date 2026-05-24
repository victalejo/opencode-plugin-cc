# Changelog

## 0.1.1

- Fix `touchedFiles` parsing: the JSONL stream from opencode 1.4.x exposes the
  written path under `part.state.input.filePath` rather than `part.input.filePath`.
  The parser now also tolerates dash-cased event types (`step-start`/`step-finish`),
  recognises `multiedit` and `patch` tools, and falls back through several
  metadata locations for the file path. New unit tests in `tests/opencode.test.mjs`
  pin the contract.

## 0.1.0

- Initial version of the opencode plugin for Claude Code, ported from OpenAI's
  `codex-plugin-cc`. Slash commands, the rescue subagent, hooks, and the
  background job tracker now drive a local `opencode` CLI instance instead of
  the Codex app-server.
