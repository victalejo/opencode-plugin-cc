---
description: List opencode sessions available to resume (filtered to the current workspace by default)
argument-hint: '[--all] [--max-count <n>]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-companion.mjs" sessions $ARGUMENTS`

Present the full command output to the user. Do not summarize or condense it. Preserve every row of the sessions table and the resume hint exactly as printed.
