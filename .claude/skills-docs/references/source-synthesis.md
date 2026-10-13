# Source Synthesis

This document records how the source corpus was converted into generalized skill behavior. It is deliberately a synthesis, not copied source material.

## Anthropic / Agent Skills
- Use small, focused skill entry points with strong trigger descriptions.
- Keep deeper guidance in references and load it only when needed.
- Treat skills as reusable capabilities rather than giant role prompts.
- Keep the format portable and validate the package mechanically.

## Open-source engineering skill ecosystems
- **obra/superpowers:** brainstorming before implementation when ambiguity is meaningful; TDD where useful; fresh-context review; subagent decomposition; verification-before-completion; worktree isolation; skills themselves should be tested against failure scenarios.
- **Everything Claude Code:** skills as the durable workflow surface; specialist agents; hooks for targeted automation; research-first behavior; keep repository/rules/project facts separate from reusable skills.
- **SteveVitali/agent-skills:** codebase-agnostic discovery; evidence-first completion; durable run/build memory; independent review; proportional rigor.
- **Jeffallan/claude-skills:** broad specialist coverage with routing/decision trees and progressive reference disclosure.
- **swell-agents/coding-skills:** focused workflow skills, portable source-of-truth skills, and parallel specialist agents/reviewers.
- **OpenSkills:** practical production workflows, clear triggers, definitions of done, anti-patterns.
- **S7adows / Agentik:** broad cross-functional libraries demonstrate how specialized capabilities can coexist without forcing every capability into every task.
- **Vercel agent-skills:** concrete production frontend and design guidance, with strong repository-specific applicability. Use as implementation evidence, not as universal rules.

## YC / Product
- Validate the problem before over-building the solution.
- Prefer evidence from actual user behavior and conversations over hypothetical enthusiasm.
- Build the smallest complete outcome that safely teaches or serves users.
- Use short learning loops: build, observe, learn, change.
- AI can compress implementation time, which makes product decisions, feedback, and evaluation more important.
- Speed never overrides mandatory security, privacy, accessibility, reliability, safety, or compliance requirements.

## Industry standards / official guidance
- **IIBA BABOK:** requirements, elicitation, analysis, strategy, solution evaluation, and selecting techniques based on context.
- **C4 / arc42:** make architecture understandable through appropriate views, decisions, constraints, and communication; remain technology/process agnostic.
- **ISO/IEC 25010:** treat quality as multiple competing characteristics, then make the important ones measurable.
- **OWASP Top 10:2025 / API Security / ASVS:** authorization, configuration, supply chain, cryptography, injection, insecure design, authentication, integrity, logging/alerting, exceptional conditions, and API-specific abuse risks.
- **NIST SSDF:** integrate secure practices throughout the SDLC; do not bolt security on at the end.
- **NIST AI RMF:** for AI-enabled systems, manage trustworthiness and risk across the AI lifecycle; use the GenAI profile when relevant.
- **W3C WCAG 2.2:** accessibility is a product/system quality requirement, not a visual afterthought.
- **Google Web Vitals:** evaluate web performance with user-centric field metrics rather than only synthetic scores.
- **OpenTelemetry:** make systems diagnosable with correlated telemetry across logs, metrics, and traces.
- **DORA:** improve delivery throughput and stability together; metrics are feedback, not targets to game.
- **SLSA / OpenSSF Scorecard:** strengthen software supply-chain provenance, integrity, and dependency/repository posture according to risk.
- **Kubernetes / Terraform official guidance:** use least privilege, secure configuration, validation, repeatability, testing, version discipline, and safe infrastructure workflows when those tools are actually selected.
- **Twelve-Factor App:** use portability, explicit dependencies/configuration, build-release-run separation, disposability, and environment parity as useful heuristics for service applications—not universal laws.
- **IETF RFC 9457:** use established HTTP semantics and machine-readable problem details where applicable instead of inventing incompatible conventions.

## Popularity and demand signals

`skills.sh` installs, repository stars, forks, and community activity are useful for discovering what practitioners use and where reusable skills exist. They are not treated as evidence that a pattern is correct. A high-demand skill can be specialized, opinionated, outdated, or wrong for a particular project.

## Synthesis rule

The universal skills use the intersection of: evidence, standards, current official documentation, mature engineering practice, product value, and project fit. When a practice is domain-specific or technology-specific, the skill teaches Claude to discover and select it rather than forcing it globally.

## Claude Code runtime mechanics
- Dynamic context injection can ground skills in current repository state before reasoning; keep injected commands bounded, deterministic, and read-only.
- Subagent definitions can preload relevant skills and restrict tools, making independent review safer and more focused.
- Forked skills are isolated from conversation history, so they should receive explicit context rather than assuming prior discussion.
- Skill content persists in conversation context after invocation; concise entry points and on-demand references reduce recurring context cost.
- The skill system itself should be evaluated for trigger accuracy, guardrail enforcement, and behavioral regressions.
