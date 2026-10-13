# Skill Evaluation

A production skill system should test the skill system itself, not only the software it helps build.

## Static checks

Validate that expected skill directories and reviewer agents exist, frontmatter parses, names are consistent, source IDs resolve, internal references exist, and no forbidden project-specific assumptions have slipped into universal files.

## Trigger checks

Use representative prompts that should trigger each skill and near-miss prompts that should not. Confirm the chosen skill is relevant rather than merely available.

## Guardrail checks

Use scenarios that attempt risky or destructive actions. Confirm the orchestrator requests evidence/authorization and reviewers stay within their intended tool boundaries.

## Behavior checks

Test that the orchestrator: discovers repository facts before prescribing technology, distinguishes requirements from assumptions, selects only relevant specialists, preserves context when necessary, uses fresh context for independent review, and refuses to claim completion without fresh evidence.

## Domain checks

Sample architecture, UI, frontend, backend, testing, DevOps, security, product, and requirements prompts. For each, verify that the skill adapts to the project rather than imposing framework, cloud, database, breakpoint, coverage, or architecture defaults.

## Regression checks

Re-run the evaluation set after modifying a skill. A skill change is a software change: compare expected behavior, not just syntax. Record important regressions and new trade-offs.
