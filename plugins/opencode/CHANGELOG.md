# Changelog

## 0.1.3

End-to-end validation of `--background`, `--cancel`, `--resume`, multi-file
`review`, and the `Stop` review-gate hook against a real opencode 1.4.x runtime.
Two latent bugs surfaced and were fixed:

- `terminateProcessTree` failed under Git Bash / MSYS shells because the
  literal `/PID` argument was being rewritten to `C:/Program Files/Git/PID`.
  We now spawn `taskkill` with `MSYS_NO_PATHCONV=1` and
  `MSYS2_ARG_CONV_EXCL=*`, restoring `/opencode:cancel` on Windows shells that
  share Git Bash's path translation.
- `handleCancel` aborted partway through when `taskkill` returned non-zero,
  leaving jobs stuck in `running`. The terminate step is now wrapped in
  try/catch so cancellation still marks the job as `cancelled` even if the
  underlying process kill fails.
- `runOpencodeTurn` now reports `session.opened` and `turn.running` progress
  events as soon as opencode emits its first `sessionID` / `messageID`, so
  `/opencode:status` and `/opencode:cancel` can act on the real thread id
  mid-flight instead of waiting for the turn to complete.

## 0.1.2

- Fix Windows spawn failure ("El sistema no puede encontrar el archivo
  especificado" / ENOENT) when the user prompt contained shell metacharacters
  such as `<`, `>`, `|`, `&`, `"`, `` ` ``, `$`, or `%`. The prompt excerpt
  flowed into `opencode --title "..."` which, under `shell: true` on Windows,
  let `cmd.exe` interpret `<task>` as stdin redirection. All argv values
  (`--title`, `--model`, `--agent`, `--session`) are now sanitized before
  spawn.
- Harden the `opencode:rescue` subagent contract: it now explicitly forbids
  using `Bash` for anything other than invoking the companion script. On
  opencode failure it must surface the verbatim error, never improvise or
  perform the task itself. This caused several earlier sessions to look like
  opencode had completed work when in fact Claude had silently substituted.

## 0.1.1

- Fix `touchedFiles` parsing: the JSONL stream from opencode 1.4.x exposes the
  written path under `part.state.input.filePath` rather than `part.input.filePath`.
  The parser now also tolerates dash-cased event types (`step-start`/`step-finish`),
  recognises `multiedit` and `patch` tools, and falls back through several
  metadata locations for the file path. New unit tests in `tests/opencode.test.mjs`
  pin the contract.
- Reject opencode-internal directories (`~/.local/share/opencode/...`,
  `~/.config/opencode/...`) as a workspace cwd. Prevents the silent failure where
  a stale `cd` inside Claude Code's persistent Bash shell makes opencode treat
  its own storage directory as the project root and auto-reject every write as
  `external_directory`.

## 0.1.0

- Initial version of the opencode plugin for Claude Code, ported from OpenAI's
  `codex-plugin-cc`. Slash commands, the rescue subagent, hooks, and the
  background job tracker now drive a local `opencode` CLI instance instead of
  the Codex app-server.
