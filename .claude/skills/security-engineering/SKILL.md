---
name: security-engineering
description: Threat-model, design, implement, audit, test, and harden software and infrastructure security. Use for authentication, authorization, APIs, secrets, data protection, dependencies, CI/CD, cloud/container security, security reviews, or production hardening.
---

# Security Engineering

Treat security as a system property spanning product requirements, architecture, code, dependencies, infrastructure, delivery, operations, and incident response.

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

## Establish the threat model

Identify assets, users, trust boundaries, entry points, privileged operations, sensitive data, dependencies, abuse cases, attacker capabilities, likely impact, and security assumptions. Prioritize by risk.

## Identity and access

Use established identity/session mechanisms when possible. Enforce server-side authorization with deny-by-default and least privilege. Check object ownership and field/property permissions, not only route-level permissions. Protect sessions/tokens and recovery flows against theft, replay, fixation, enumeration, and abuse.

## Input and output

Validate untrusted input at trust boundaries. Use parameterized APIs and context-appropriate encoding. Limit size/rate/resource consumption. Prevent injection classes, unsafe file access, SSRF, insecure redirects, dangerous deserialization, and overexposure as applicable.

## Secrets and cryptography

Do not hard-code credentials. Use appropriate secret storage and short-lived credentials where practical. Select proven cryptographic primitives and libraries; define key lifecycle, rotation, recovery, and access controls according to risk.

## API and business security

Check object-level and property-level authorization, authentication, resource abuse, unsafe consumption of integrations, and data minimization. Secure business workflows—not only technical endpoints.

## Supply chain and runtime

Assess dependencies, build provenance, CI permissions, artifact integrity, container/workload configuration, network exposure, and runtime hardening. Use stronger assurance levels when consequences justify it.

## Secure development lifecycle

Integrate security into requirements, design, implementation, review, testing, release, monitoring, and response. Findings must map to evidence and a remediation decision, not just a scanner score.

## Privacy and telemetry

Minimize collection, access, retention, and exposure of sensitive data. Ensure logs and traces do not become a secondary data leak.

## Security verification

Use threat-model reviews, static analysis, dependency scanning, dynamic testing, API testing, configuration review, and targeted manual testing according to risk. Re-check fixes for regressions.

## Source lineage
Source IDs used for this skill: OWASP-TOP10-2025, OWASP-API-2023, OWASP-ASVS, NIST-SSDF, NIST-AI-RMF, SLSA, OPENSSF-SCORECARD, K8S-SECURITY, ECC, SUPERPOWERS.

OWASP Top 10:2025, OWASP API Security Top 10:2023, OWASP ASVS, NIST SP 800-218 SSDF, NIST AI RMF + GenAI Profile, SLSA v1.2, OpenSSF Scorecard, Kubernetes Security, Everything Claude Code, obra/superpowers.
