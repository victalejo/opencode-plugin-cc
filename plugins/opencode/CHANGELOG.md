# Changelog

## 0.1.0

- Initial version of the opencode plugin for Claude Code, ported from OpenAI's
  `codex-plugin-cc`. Slash commands, the rescue subagent, hooks, and the
  background job tracker now drive a local `opencode serve` HTTP instance
  instead of the Codex app-server.
