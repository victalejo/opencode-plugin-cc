# opencode plugin for Claude Code

[![CI](https://github.com/victalejo/opencode-plugin-cc/actions/workflows/pull-request-ci.yml/badge.svg)](https://github.com/victalejo/opencode-plugin-cc/actions/workflows/pull-request-ci.yml)

Use [opencode](https://opencode.ai) from inside Claude Code for code reviews or to delegate tasks.

> Léelo en [español](README.es.md).

This plugin is a port of OpenAI's `codex-plugin-cc` that swaps the Codex backend for the [opencode CLI](https://opencode.ai/docs/cli). Each task or review shells out to `opencode run --format json`, captures the JSONL event stream, and surfaces the resulting session id so jobs can be resumed later with `opencode run --continue --session <id>`. The same workflow lives on the Claude Code side: slash commands, a rescue subagent, optional stop-time review gate, background job tracking, and result reporting.

## What You Get

- `/opencode:review` — read-only code review of your current git state
- `/opencode:adversarial-review` — steerable challenge review with focus text
- `/opencode:rescue`, `/opencode:status`, `/opencode:result`, `/opencode:cancel` — delegate work and manage background jobs
- `/opencode:diff` — show a git diff scoped to files opencode touched in the last rescue
- `/opencode:sessions` — list opencode sessions available to resume in this workspace
- `/opencode:setup` — verify the local opencode CLI, ask to install if missing, toggle the stop-time review gate

## Requirements

- **opencode CLI** (`opencode --version` must work). Install with:
  - `npm install -g opencode-ai`, or
  - `curl -fsSL https://opencode.ai/install | bash` (see [opencode docs](https://opencode.ai/docs))
- **At least one configured provider** (Anthropic, OpenAI, OpenRouter, etc.). Run `opencode auth login` to set one up.
- **Node.js 18.18 or later** (used by the companion runtime that wraps opencode).
- **Claude Code** (this plugin runs inside Claude Code's plugin system).

## Install

Add the marketplace in Claude Code:

```bash
/plugin marketplace add victalejo/opencode-plugin-cc
```

Install the plugin:

```bash
/plugin install opencode@opencode-plugin-cc
```

Reload plugins:

```bash
/reload-plugins
```

Then run:

```bash
/opencode:setup
```

`/opencode:setup` tells you whether opencode is installed and at least one provider is configured. If opencode is missing and npm is available, the setup command can install it for you.

If opencode is installed but no provider is configured:

```bash
!opencode auth login
```

After install you should see:

- the slash commands listed below
- the `opencode:rescue` subagent in `/agents`

A typical first run:

```bash
/opencode:review --background
/opencode:status
/opencode:result
```

## Usage

### `/opencode:review`

Runs a focused opencode code review on the current change set. Useful when you want:

- a review of your current uncommitted changes
- a review of your branch compared to a base ref like `main`

Use `--base <ref>` for branch review. Supports `--wait` and `--background`. It is not steerable and does not take custom focus text — use [`/opencode:adversarial-review`](#opencodeadversarial-review) when you want to challenge a specific decision or risk area.

Examples:

```bash
/opencode:review
/opencode:review --base main
/opencode:review --background
```

This command is read-only and will not perform any changes. When run in the background you can use [`/opencode:status`](#opencodestatus) to check progress and [`/opencode:cancel`](#opencodecancel) to abort it.

### `/opencode:adversarial-review`

Runs a **steerable** review that questions the chosen implementation and design.

It can be used to pressure-test assumptions, tradeoffs, failure modes, and whether a different approach would have been safer or simpler.

It uses the same review target selection as `/opencode:review`, including `--base <ref>` for branch review. It also supports `--wait` and `--background`. Unlike `/opencode:review`, it can take extra focus text after the flags.

Examples:

```bash
/opencode:adversarial-review
/opencode:adversarial-review --base main challenge whether this was the right caching and retry design
/opencode:adversarial-review --background look for race conditions and question the chosen approach
```

This command is read-only. It does not fix code.

### `/opencode:rescue`

Hands a task to opencode through the `opencode:rescue` subagent.

Use it when you want opencode to:

- investigate a bug
- try a fix
- continue a previous opencode task
- take a faster or cheaper pass with a smaller model

Supports `--background`, `--wait`, `--resume`, `--fresh`, `--model <provider/model>`, and `--context <file1,file2,...>`. If you omit `--resume` and `--fresh`, the plugin can offer to continue the latest rescue session for this repo.

`--context` takes a comma-separated list of file paths (relative to the workspace) and inlines those files into the prompt sent to opencode, so opencode does not have to spend a discovery turn re-locating them.

Examples:

```bash
/opencode:rescue investigate why the tests started failing
/opencode:rescue fix the failing test with the smallest safe patch
/opencode:rescue --resume apply the top fix from the last run
/opencode:rescue --model anthropic/claude-sonnet-4-20250514 investigate the flaky integration test
/opencode:rescue --background investigate the regression
/opencode:rescue --context src/auth.ts,src/auth.test.ts explain why the new auth test fails
```

You can also just ask in plain prose for a task to be delegated to opencode:

```text
Ask opencode to redesign the database connection to be more resilient.
```

Notes:

- If you do not pass `--model`, opencode picks its own default from `~/.config/opencode/opencode.json`.
- Follow-up rescue requests can continue the latest opencode task in the repo with `--resume`.

### `/opencode:status`

Shows running and recent opencode jobs for the current repository.

```bash
/opencode:status
/opencode:status task-abc123
```

### `/opencode:result`

Shows the final stored opencode output for a finished job, including the opencode session ID so you can reopen it with `opencode run --continue --session <id>`.

```bash
/opencode:result
/opencode:result task-abc123
```

### `/opencode:cancel`

Cancels an active background opencode job.

```bash
/opencode:cancel
/opencode:cancel task-abc123
```

### `/opencode:diff`

Shows a `git diff HEAD` plus a `git status --porcelain` scoped to the files opencode reported touching in the last (or specified) rescue job. Useful for quickly reviewing only the changes a `--write` rescue produced, without surrounding edits you made yourself.

```bash
/opencode:diff
/opencode:diff task-abc123
```

If the resolved job did not touch any files (for example, a read-only rescue), the command reports that explicitly and points you at `/opencode:result`.

### `/opencode:sessions`

Lists opencode sessions available to resume. By default it filters to the current workspace directory.

```bash
/opencode:sessions
/opencode:sessions --all
/opencode:sessions --max-count 50
```

Each row shows the session id, title, relative age, and the directory the session was started in. To resume a specific session inside opencode, copy its id and run:

```bash
opencode run --continue --session <session-id>
```

### `/opencode:setup`

Checks whether opencode is installed and authenticated. If opencode is missing and npm is available, it can offer to install opencode for you.

You can also use `/opencode:setup` to manage the optional review gate.

#### Enabling review gate

```bash
/opencode:setup --enable-review-gate
/opencode:setup --disable-review-gate
```

When the review gate is enabled, the plugin uses a `Stop` hook to run a targeted opencode review on Claude's previous turn. If the review finds issues, the stop is blocked so Claude can address them first.

> [!WARNING]
> The review gate can create a long-running Claude/opencode loop and may drain provider quota quickly. Only enable it when you plan to actively monitor the session.

## Typical Flows

### Review Before Shipping

```bash
/opencode:review
```

### Hand A Problem To opencode

```bash
/opencode:rescue investigate why the build is failing in CI
```

### Start Something Long-Running

```bash
/opencode:adversarial-review --background
/opencode:rescue --background investigate the flaky test
```

Then check in with:

```bash
/opencode:status
/opencode:result
```

## How it integrates with opencode

This plugin shells out to the [opencode CLI](https://opencode.ai/docs/cli) for every task or review. The companion runtime:

1. Spawns `opencode run --format json [--continue --session <id>] [--model …] [--agent plan|build]` in the workspace root.
2. Writes the prompt to the child's stdin (so long diffs and shell metacharacters survive cleanly on Windows and POSIX shells).
3. Parses the JSONL event stream (`step_start`, `text`, `step_finish`, `tool_call`) into the assistant's final text, touched files, and the session id.
4. Persists job metadata under `${plugin-data}/state/<workspace>/...` so `/opencode:status` and `/opencode:result` work across turns. Each finished job records its opencode session id so you can re-enter it later with `opencode run --continue --session <id>`.

Background jobs spawn a detached worker that re-uses the same flow and updates the job file as opencode streams events back.

### Common configuration

The default model and provider come from opencode itself, so anything you set in `~/.config/opencode/opencode.json` (or per-project `opencode.json`) applies to plugin tasks too. For example:

```json
{
  "model": "anthropic/claude-sonnet-4-20250514"
}
```

See [opencode config docs](https://opencode.ai/docs/config) for the full list of options.

### Resuming a job inside opencode

`/opencode:result` prints the opencode session id used by the job. To open that session directly in opencode you can run:

```bash
opencode run --continue --session <session-id>
```

## FAQ

### Do I need a separate opencode account?

No — opencode is provider-agnostic. Plug in whatever provider you already have (Anthropic, OpenAI, OpenRouter, etc.) via `opencode auth login`. The plugin uses your local opencode CLI.

### Does the plugin spin up a new opencode for each command?

Yes — every command runs `opencode run` as a fresh process. opencode itself handles session persistence on disk (`~/.local/share/opencode/...`) so resuming via `--continue --session <id>` reuses the same conversation history.

### Can I point the plugin at a custom opencode binary?

Yes. Set `OPENCODE_BIN=/path/to/opencode` and the companion will spawn that binary instead of looking up `opencode` on `PATH`.

### Where does state live?

Per-workspace job state, logs, and the server endpoint are stored under `$CLAUDE_PLUGIN_DATA/state/<workspace-slug>/` if that variable is set, otherwise `os.tmpdir()/codex-companion/<workspace-slug>/`.

## License

Apache-2.0. This project is derived from OpenAI's `codex-plugin-cc` under the same license. See `LICENSE` and `NOTICE`.
