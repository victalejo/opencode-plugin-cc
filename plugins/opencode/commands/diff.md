---
description: Show a git diff scoped to the files opencode touched in the last (or specified) rescue job
argument-hint: '[job-id]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-companion.mjs" diff "$ARGUMENTS"`

Present the full command output to the user. Do not summarize or rewrite the diff hunks. Preserve file paths, line numbers, status codes, and diff markers exactly as printed.
