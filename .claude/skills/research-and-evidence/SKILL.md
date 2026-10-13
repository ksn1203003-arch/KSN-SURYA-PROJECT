---
name: research-and-evidence
description: Perform current, evidence-based technical or product research before high-impact decisions. Use when requirements, technology choices, standards, security posture, architecture, or vendor/tool behavior may have changed or when authoritative verification matters.
---

# Research and Evidence

Research to reduce consequential uncertainty—not to collect links.

## Source discipline
Use the repository and task as the primary context. Use external knowledge selectively when it can improve a decision.
Treat sources in this order unless the project or law requires otherwise:
1. applicable law/regulation and binding organizational policy
2. authoritative standards/specifications
3. official documentation for the chosen technology
4. mature, well-maintained open-source engineering practice
5. practitioner/community material and adoption signals
6. generic model knowledge

When sources disagree, identify the conflict and prefer the most authoritative, current, and applicable evidence. Never turn a recommendation into a false requirement. Record important source-dependent decisions.

## Generalization rule
Do not assume a programming language, framework, database, cloud, UI library, architecture style, delivery platform, repository layout, team size, or vendor. Discover what exists and what the project requires, then choose deliberately.

## Change rule
Prefer the smallest change that materially improves the requested outcome. Do not introduce infrastructure, abstractions, services, frameworks, or process merely because they are fashionable or available.

## Runtime and harness verification

When researching how Claude Code or another agent harness behaves, prefer its current official documentation over community examples. Verify supported frontmatter, invocation, subagent, permission, dynamic-context, and reload behavior against the installed/current documentation before encoding it into a reusable skill.

## Research trigger

Research when a decision depends on fast-changing facts, niche behavior, current versions, compatibility, security status, standards, legal/regulatory requirements, or a disputed recommendation.

## Source hierarchy

Prefer authoritative standards and official documentation. Use mature open-source projects to discover tested workflows and common implementation patterns. Use community popularity/install data as a demand or discovery signal, not as proof of correctness.

## Compare, don't cargo-cult

For each significant candidate:
- what problem it solves
- evidence of maturity/maintenance
- compatibility and constraints
- operational cost and complexity
- security implications
- migration/exit path
- fit to the repository/project
- alternatives considered

Separate source fact, source recommendation, project inference, and final decision.

## Open-source skill research

When researching agent skills, inspect structure, triggering descriptions, workflows, references, scripts, tests, evaluation approach, and license/credit notes. Extract reusable principles. Do not copy large third-party skill bodies or assume one project's opinions are universal.

## Freshness

Check the publication/release date and current status. For fast-moving technologies, prefer current official documentation over stale articles or model memory. When a source is only partially accessible, say so.

## Evidence ledger

For material decisions, record the claim, source, relevance, date/status, confidence, and how the finding changed the decision. Keep the research concise enough to be auditable.

## Source lineage
Source IDs used for this skill: ANTHROPIC-SKILLS, AGENT-SKILLS-SPEC, CLAUDE-CODE-DOCS, SUPERPOWERS, ECC, STEVEVITALI, JEFFALLAN, SWELL, OPENSKILLS, S7ADOWS, AGENTIK, VERCEL-SKILLS, YC-SKILLS, PRODUCTSKILLS, SKILLS-SH, OWASP-TOP10-2025, NIST-SSDF, WCAG-2-2, DORA.

All source families in `references/source-registry.md` are eligible inputs. Use the hierarchy above to decide their weight.
