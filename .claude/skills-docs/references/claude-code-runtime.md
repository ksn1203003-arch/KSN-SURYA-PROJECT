# Claude Code Runtime Patterns

This reference captures current harness mechanics that affect how reusable skills should be authored. Treat the official Claude Code documentation as the authority for version-specific behavior.

## Skill loading

Keep `SKILL.md` bodies concise. Skills can load automatically when relevant or be invoked directly. Supporting files are available for deeper material instead of forcing every reference into the active context. Invoked skill content remains in conversation context, so unnecessary length creates recurring context cost.

## Frontmatter

The current Claude Code frontmatter supports fields including `name`, `description`, `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`, `paths`, `context`, `agent`, and `shell`, with additional fields documented by Claude Code. Use only fields whose behavior is actually needed. `name` and `description` are the key portable fields.

## Dynamic context injection

`!`command`` and fenced `!` shell blocks can inject live command output into a skill before Claude receives it. This is useful for current git state, diffs, manifests, versions, and other deterministic read-only facts. Commands are subject to permission and shell behavior; a failed injected command can abort skill invocation. Use bounded, non-destructive commands and avoid injecting secrets or huge outputs.

Use `${CLAUDE_PROJECT_DIR}` or `${CLAUDE_SKILL_DIR}` when a path must remain stable across working-directory changes.

## Subagents and skills

A skill can run in an isolated subagent context with `context: fork`; the forked agent does not inherit the conversation history, so its skill must contain or receive enough context to act. A custom subagent can preload relevant skills using its `skills` frontmatter. Use read-only `tools` for reviewers whenever possible, and consider worktree isolation for agents that may modify code.

## Permissions

`allowed-tools` pre-approves listed tools for the turn that invokes a skill; it does not replace the broader permission system and it can be risky in repository-shipped skills. Keep grants narrow. Reviewers should normally use read-only tools.

## Skill lifecycle and evaluation

Claude Code can reload edited skills during a session in supported locations, but skill content already invoked remains in context until compaction/reload behavior applies. After changing a reusable skill, validate its frontmatter and run behavioral evaluations for triggering, evidence requirements, safety boundaries, and completion claims.
