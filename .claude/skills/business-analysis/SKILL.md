---
name: business-analysis
description: Analyze business needs, requirements, rules, processes, stakeholders, scope, acceptance criteria, and solution value. Use when translating ideas into testable requirements or resolving ambiguity across business and technical teams.
---

# Business Analysis

Turn business intent into clear, testable, traceable change without prematurely locking implementation choices.

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

## Understand the context

Capture the current state, target state, actors, goals, constraints, dependencies, policies, business rules, decision points, exceptions, and success measures.

## Elicit and classify requirements

Distinguish:
- functional requirements
- quality/non-functional requirements
- business rules
- data requirements
- integration requirements
- regulatory/policy constraints
- assumptions and decisions
- explicit non-goals

Use interviews, observation, document analysis, workshops, process models, use cases, scenarios, prototypes, and data analysis as appropriate to the context.

## Use established requirement formats when useful

For Agile backlogs, INVEST can be a useful quality check for stories; Given/When/Then or equivalent scenario formats can make acceptance behavior concrete. Do not force these formats on domains where a different specification or evidence format is clearer.

## Make requirements testable

For each important requirement, identify observable behavior, preconditions, expected results, failure conditions, authorization implications, and measurable quality criteria where relevant. Remove ambiguous adjectives such as “fast,” “secure,” or “easy” unless they are operationalized.

## Model the workflow

Map happy paths and meaningful alternate/error paths. Identify ownership, state transitions, approvals, handoffs, timing constraints, retries, and irreversible actions.

## Define acceptance

Acceptance criteria should prove the intended business outcome, not just implementation details. Link critical criteria to tests, demonstrations, metrics, or other evidence.

## Control scope

Keep a clear distinction between must-have outcomes, enabling work, risks, options, and future ideas. When a requested feature conflicts with constraints, expose the trade-off rather than silently weakening another requirement.

## Solution evaluation

After implementation, compare delivered behavior with intended outcomes. Record gaps, limitations, unresolved assumptions, and recommended follow-up.

## Source lineage
Source IDs used for this skill: IIBA-BABOK, PRODUCTSKILLS, YC-SKILLS, ANTHROPIC-SKILLS.

IIBA BABOK, assimovt/productskills, jona/ycombinator-skills. Use the BABOK technique catalogue as a toolbox, selecting techniques according to context rather than applying all of them.
