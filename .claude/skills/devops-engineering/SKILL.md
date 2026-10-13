---
name: devops-engineering
description: Design, improve, review, and operate software delivery and runtime infrastructure across cloud, on-premises, hybrid, containers, serverless, VMs, CI/CD, observability, infrastructure as code, release strategy, resilience, and recovery. Use when shipping or operating software safely.
---

# DevOps / Platform Engineering

Make software safe to build, release, run, observe, recover, and evolve. Discover the actual platform before prescribing tools.

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

## Discover the environment

Identify source control, build system, artifact flow, runtime, deployment strategy, environments, secrets management, IAM, networking, infrastructure-as-code, monitoring, incident practices, backups, recovery objectives, and cost controls.

## Delivery design

Separate build, test, package, release, and run concerns where appropriate. Make promotion, provenance, environment configuration, approvals, rollback/forward-fix, and auditability explicit.

## Infrastructure as code

Prefer declarative, reviewable, repeatable infrastructure.

When Terraform/OpenTofu is actually in use, protect resource identity during refactors, prefer stable keyed addressing for collections when appropriate, use state locking where supported, and inspect plans for unexpected replacement or destruction. Use resource-move mechanisms supplied by the tool when renaming resources without intending recreation. Validate, lint, test, and plan safely before apply. Pin or constrain versions appropriately. Keep secrets out of source and use suitable secret-management mechanisms.

## Release strategies

Choose deployment topology and rollout controls based on blast radius, reversibility, workload characteristics, user impact, migration compatibility, and operational capability. Options may include progressive rollout, canary, blue/green, rolling, immutable, feature flags, scheduled, or simpler approaches.

## Observability

Use logs, metrics, traces and appropriate events together. Define signals for availability, latency, errors, saturation, key business outcomes, and security-relevant activity. Alerts should be actionable and mapped to response ownership.

## Reliability and recovery

Define service-level objectives or equivalent goals when warranted. Consider graceful degradation, dependency failures, capacity, backup/restore, disaster recovery, restore testing, data integrity, and failure isolation.

## Supply chain

Control dependencies, build environments, provenance, artifact integrity, signing/verification where appropriate, least-privileged CI identities, and access to release credentials. Apply stronger controls to higher-risk or regulated software.

## Delivery metrics

Use DORA metrics as a feedback lens, not a target to game. Look for improvements in throughput and instability together and interpret metrics in context.

## Source lineage
Source IDs used for this skill: DORA, OPENTELEMETRY, SLSA, OPENSSF-SCORECARD, K8S-SECURITY, TERRAFORM-STYLE, TWELVE-FACTOR, ECC, STEVEVITALI, SUPERPOWERS.

DORA research, OpenTelemetry, SLSA v1.2, OpenSSF Scorecard, Kubernetes Security, HashiCorp Terraform style guide, Twelve-Factor App, Everything Claude Code, SteveVitali/agent-skills, obra/superpowers.
