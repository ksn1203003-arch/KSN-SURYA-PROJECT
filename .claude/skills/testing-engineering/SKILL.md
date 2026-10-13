---
name: testing-engineering
description: Plan, implement, diagnose, review, and improve software testing across unit, component, integration, contract, end-to-end, accessibility, performance, security, resilience, and regression testing. Use when validating changes or designing a test strategy.
---

# Testing Engineering

Testing is evidence about behavior and risk. Optimize for meaningful failure detection and confidence, not a vanity coverage number.

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

## Discover the test system

Identify the existing test runner(s), fixtures, test data, environment setup, CI behavior, flaky tests, coverage reporting, browser/device matrix, service dependencies, and project-specific verification commands.

## Start from risk and behavior

Map critical user/business paths, high-risk invariants, integration boundaries, authorization rules, data migrations, concurrency, failure recovery, and historically fragile areas. Test those first.

## Layer tests appropriately

Use a balanced mix:
- unit tests for focused logic and invariants
- component/module tests for local integration
- integration/contract tests for real boundaries
- end-to-end tests for critical user outcomes
- accessibility/performance/security/resilience tests when their risks apply

Do not force every layer onto every feature.

## Test structure

Use a clear structure such as Arrange → Act → Assert when it improves readability, or an equivalent structure supported by the project's testing style. The important property is that preconditions, behavior, and expected outcomes are easy to distinguish.

## TDD where useful

For logic that benefits from tight feedback, prefer RED → GREEN → REFACTOR: establish a failing behavior, implement the smallest solution, then simplify. For exploratory or visual work, use an appropriate alternative rather than forcing artificial tests.

## Verify failure modes

Test malformed inputs, permission failures, retries, duplicate requests/events, timeouts, dependency failures, partial completion, stale state, cancellation, migration compatibility, and recovery where relevant.

## Browser and interaction verification

For browser E2E checks, prefer stable user-facing locators (role, label, accessible name, visible text or equivalent semantic hooks) over brittle DOM/CSS/XPath selectors. Replace arbitrary sleeps with explicit readiness, event, or condition-based waits.

## Mutation and fault-oriented checks

Where the project can support them, use mutation testing or deliberate fault injection selectively on high-value logic to validate that tests actually detect important regressions. Treat these as evidence techniques, not mandatory ceremony.

## Flake discipline

Treat flaky tests as reliability defects. Identify whether the cause is timing, shared state, environment, nondeterminism, external dependencies, or a real race. Fix the cause or redesign the test; do not hide failures with unconditional retries.

## Coverage

Use coverage as a diagnostic signal. Increase expectations for critical code, but do not equate a percentage with correctness. Missing behavior, weak assertions, or duplicated tests can produce high coverage with low confidence.

## Completion gate

Run the most relevant verification commands and inspect results before claiming success. Fresh evidence is required for claims about tests, builds, bug fixes, regressions, and acceptance criteria.

## Source lineage
Source IDs used for this skill: SUPERPOWERS, STEVEVITALI, SWELL, OPENSKILLS, JEFFALLAN, ANTHROPIC-SKILLS, DORA, ISO-25010.

obra/superpowers, SteveVitali/agent-skills, swell-agents/coding-skills, CODE-SAURABH/OpenSkills, Jeffallan/claude-skills, Anthropic Agent Skills, DORA research, ISO/IEC 25010:2023.
