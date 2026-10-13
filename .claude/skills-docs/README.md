# Universal Production Engineering Skills for Claude Code

A project-agnostic engineering team built by synthesizing multiple source families rather than copying any single skill library.

## Design goal

Say what you want to build or change. The system first discovers the project, requirements, risks and existing conventions, then selects appropriate product, UX, architecture, implementation, security, test and operations practices. It deliberately avoids locking you into a framework, cloud, database, design system or architecture style.

## Included skills

- product-discovery
- business-analysis
- ui-ux-design
- frontend-engineering
- backend-engineering
- system-architecture
- testing-engineering
- devops-engineering
- security-engineering
- production-orchestrator
- research-and-evidence

## Independent reviewers

code-reviewer, architect-reviewer, security-reviewer, test-reviewer, ux-reviewer

## Source corpus

See `references/source-registry.md`. It includes Anthropic/Agent Skills, leading open-source skill libraries, YC/product methods, and industry standards. The package uses those sources as research inputs and synthesizes reusable principles; it does not copy their full text.

## Generalization guardrails

1. Discover existing project/toolchain choices before recommending replacements.
2. Separate normative requirements from heuristics and preferences.
3. Prefer current official documentation for fast-moving tools.
4. Use mature open-source skills for workflow patterns and examples.
5. Use popularity/install counts only as discovery signals, never as proof.
6. Prefer the simplest solution that satisfies the actual constraints.
7. Verify important claims with fresh evidence.
8. Keep project-specific decisions in the project, not in these universal skills.

## Skill-system evaluation

`references/skill-evaluation.md` defines how to test the skills themselves for triggering, guardrails, adaptation, and regression. `references/claude-code-runtime.md` records current Claude Code harness patterns used by the package.

## Source synthesis

`references/source-synthesis.md` explains what was extracted from each source family and how it was generalized into the skills.
