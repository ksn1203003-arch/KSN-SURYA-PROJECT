---
name: backend-engineering
description: Design, implement, debug, and review production backend systems, services, APIs, jobs, integrations, and data access layers. Use after discovering the repository's actual runtime, framework, storage, and operational constraints.
---

# Backend Engineering

Build for correctness first, then security, operability, resilience, performance, and maintainability. Match design complexity to requirements.

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

## Inspect before changing

Identify runtime/language, framework, dependency boundaries, API style, persistence technologies, caching, queues, jobs, external integrations, authentication, authorization, observability, deployment, and existing conventions.

## Define contracts and invariants

Make input/output contracts explicit. Identify business invariants, ownership rules, idempotency needs, transactional boundaries, consistency expectations, versioning strategy, and compatibility constraints.

## Validate untrusted input

Validate syntax, type, size, format, range, semantics, authorization, and resource limits at appropriate trust boundaries. Keep authorization server-side. Prevent injection, unsafe deserialization, SSRF, path traversal, mass assignment/property over-posting, and data overexposure where applicable.

## Design for failure

Consider timeouts, retries with bounded backoff, idempotency, deduplication, cancellation, concurrency, partial failure, dependency outages, queue redelivery, poison messages, circuit-breaking where useful, graceful degradation, and recovery.

## Data discipline

Choose storage from access patterns, correctness, scale, transactionality, lifecycle, operational needs, and team fit. Prefer explicit data ownership and migration strategies. Protect sensitive data in transit and at rest according to requirements. Do not assume rollback of a schema change is always safe; use compatibility and recovery strategies suited to the migration.

## APIs

Use consistent semantics, validation, authorization, error handling, pagination/filtering where needed, versioning/deprecation, rate/resource limits, and observable request correlation. For HTTP APIs that benefit from machine-readable errors, consider established formats such as RFC 9457 rather than inventing an incompatible error schema. Use established HTTP semantics rather than inventing competing meanings.

## Resource lifecycle and shutdown

Give network clients, database pools, queues, workers, timers, and streams explicit lifecycle rules. Where the runtime supports graceful shutdown, stop accepting new work, finish or safely cancel in-flight work, drain/flush critical resources, and terminate within a bounded deadline.

## Observability

Emit structured, actionable logs and appropriate metrics/traces. Preserve correlation across boundaries. Avoid sensitive data in telemetry. Instrument critical business and reliability paths so incidents can be diagnosed without guesswork.

## Asynchronous consistency patterns

When work crosses transactional or process boundaries, consider an outbox, inbox/idempotency record, saga/compensation, deduplication, or another established consistency pattern when it fits the actual failure and consistency requirements. Do not add distributed coordination without evidence.

## Verification

Test normal behavior and important failure modes. Use unit, integration, contract, and higher-level tests according to risk. Exercise concurrency and boundary cases where they matter. Verify migrations separately when data is at stake.

## Source lineage
Source IDs used for this skill: STEVEVITALI, SWELL, OPENSKILLS, JEFFALLAN, OWASP-TOP10-2025, OWASP-API-2023, IETF-RFC9457, OPENTELEMETRY, TWELVE-FACTOR, ISO-25010.

SteveVitali/agent-skills, swell-agents/coding-skills, Jeffallan/claude-skills, CODE-SAURABH/OpenSkills, OWASP Top 10:2025, OWASP API Security Top 10:2023, IETF RFC 9457, OpenTelemetry, Twelve-Factor App, ISO/IEC 25010:2023.
