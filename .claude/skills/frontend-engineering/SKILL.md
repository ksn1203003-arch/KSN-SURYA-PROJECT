---
name: frontend-engineering
description: Build, refactor, debug, and review production frontend applications. Use for UI implementation, state and data flow, browser behavior, accessibility, client performance, frontend architecture, or framework-specific work after repository discovery.
---

# Frontend Engineering

Treat the frontend as a product system: behavior, rendering, state, data, accessibility, performance, security, and maintainability must work together.

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

## Inspect the actual frontend

Identify framework, runtime, routing/rendering model, styling/design system, state/data libraries, build tool, browser/device support, test setup, linting, deployment target, and existing conventions before adding dependencies or patterns.

## Choose boundaries deliberately

Separate concerns according to the project's actual complexity. Keep state close to its owner when possible. Distinguish server/remote state, URL state, local ephemeral state, shared application state, and derived state. Avoid global state by default and avoid abstractions that only save a few repeated lines.

## Build resilient UI

Account for loading, partial data, empty states, errors, cancellation, retries, stale data, duplicate actions, optimistic updates, permission failures, offline/poor connectivity when relevant, and recoverability.

## Accessibility is structural

Use semantic elements and accessible names. Preserve keyboard and focus behavior. Ensure dynamic updates are perceivable. Do not rely on color alone. Validate with automated checks plus manual interaction and assistive-technology-oriented review where warranted.

## Performance

Use real user goals and field data where available. Control JavaScript cost, render work, network waterfalls, image/media weight, layout instability, input latency, and cache behavior. For web products, use Core Web Vitals as a user-centric measurement lens rather than optimizing synthetic scores in isolation.

## Browser and platform correctness

Respect actual platform behavior, HTTP semantics, security boundaries, storage constraints, concurrency, navigation lifecycle, and progressive enhancement/degradation requirements where applicable.

## Verification

Run the repository's formatter/linter/type checks/tests/build commands and targeted browser/user-flow checks. Add or update tests for behavior that can regress. Do not claim performance or accessibility success without measuring the relevant surface.

## Source lineage
Source IDs used for this skill: ANTHROPIC-SKILLS, VERCEL-SKILLS, JEFFALLAN, ECC, SUPERPOWERS, WCAG-2-2, WEB-VITALS, IETF-RFC9457.

Anthropic Agent Skills, vercel-labs/agent-skills, Jeffallan/claude-skills, Everything Claude Code, obra/superpowers, W3C WCAG 2.2, Google Web Vitals, IETF RFC 9457.
