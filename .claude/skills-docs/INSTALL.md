# Install

## Project-local

Copy `.claude/skills` and `.claude/agents` into the target repository's `.claude/` directory. Merge the contents of `CLAUDE.template.md` into the repository's existing `CLAUDE.md` rather than replacing project-specific instructions.

## Global

You may copy the skills and agents into your user-level Claude Code skill/agent directories when you want them across projects. Keep project-specific facts out of the global files.

## Validation

Run:

`python scripts/validate-skills.py`

The validator checks naming/frontmatter, structure, missing source IDs, broken internal references, and obvious project-specific hard-coding.
