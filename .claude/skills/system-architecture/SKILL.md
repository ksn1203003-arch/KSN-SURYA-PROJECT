---
name: system-architecture
description: Design, assess, explain, or improve software and system architecture. Use for new applications, major structural changes, scalability/reliability reviews, migrations, architecture diagrams, ADRs, or requests to make an architecture substantially better.
---

# System Architecture

Architecture is the set of decisions that shape system behavior, boundaries, quality, and evolution. Do not choose an architecture style before understanding the constraints.

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

## Start with context

Establish:
- goals and non-goals
- users, actors and external systems
- principal workflows
- data domains and ownership
- quality attributes with measurable scenarios
- security/privacy/compliance needs
- scale/latency/availability expectations
- team and operational constraints
- deployment/runtime environment
- cost and lifecycle expectations
- known failure modes

## Characterize the workload

Before selecting major architectural boundaries, quantify the meaningful operating profile where possible: request/event rates, latency objectives, availability needs, data volume and growth, concurrency, burstiness, geographic distribution, retention, consistency, recovery objectives, cost envelope, and team/operational capability. Use concrete measurements or bounded estimates; do not invent precision.

## Compare options

Evaluate plausible architectures—including retaining the current design—against the actual constraints. Consider modular monoliths, service decomposition, event-driven patterns, serverless, batch, streaming, edge, embedded, hybrid, and other relevant forms without treating any as universally superior.

Explicitly compare complexity, coupling, consistency, failure isolation, deployability, observability, testability, operability, performance, scaling, security boundaries, cost, and reversibility.

## Boundaries

Prefer boundaries that align with business capabilities, ownership, data authority, change patterns, and failure domains. Make cross-boundary contracts explicit. Avoid both giant unstructured modules and premature microservices.

## Data and failure architecture

Trace important data end-to-end. Identify authoritative sources, consistency expectations, retention/deletion, backfills, migrations, replay, duplication, ordering, idempotency, and recovery. Model dependency and failure propagation.

## Distributed workflow patterns

For cross-component changes, consider queues/events, transactional outbox, idempotent consumers, sagas/compensation, dead-letter handling, backpressure, or other patterns only when the workflow actually needs them. Explain the failure and operational trade-off.

## Documentation

Use the smallest architecture documentation that makes the system understandable and reviewable. For substantial systems, use context/container/component/deployment views or equivalent, plus ADRs for significant decisions. Keep docs synchronized with reality.

## Evolution

Prefer designs with deliberate seams for likely change. Avoid speculative abstraction. For irreversible decisions, establish stronger evidence and explicit approval.

## Architecture review

Challenge the design from security, reliability, operability, cost, developer experience, user impact, and migration perspectives. Verify the architecture against runtime evidence when changing an existing system.

## Source lineage
Source IDs used for this skill: C4, ARC42, ISO-25010, TWELVE-FACTOR, DORA, STEVEVITALI, SUPERPOWERS, SWELL, ECC.

C4 model, arc42, ISO/IEC 25010:2023, Twelve-Factor App, DORA research, SteveVitali/agent-skills, obra/superpowers, swell-agents/coding-skills, Everything Claude Code.
