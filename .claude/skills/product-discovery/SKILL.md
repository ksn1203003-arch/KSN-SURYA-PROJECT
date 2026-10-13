---
name: product-discovery
description: Discover and validate what should be built before expanding implementation. Use for new products, ambiguous features, MVPs, prioritization, user research, experiments, product strategy, or requests that may be solving the wrong problem.
---

# Product Discovery

Find the highest-value problem and the smallest credible path to a complete outcome. Do not confuse a requested feature with a validated need.

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

## Establish the problem

Identify:
- target users and meaningful segments
- jobs, goals, pain points and current alternatives
- observable evidence of the problem
- frequency, severity, urgency and consequences
- current workaround and switching cost
- business value and constraints
- risks, dependencies and ethical considerations

Prefer evidence from observed behavior, existing data, user interviews, support history, workflows, and experiments over hypothetical enthusiasm.

## Validate without leading

Ask about concrete past behavior and current processes. Separate facts from interpretations. Avoid leading users into endorsing a proposed feature. When evidence is weak, label the idea as a hypothesis and design the cheapest safe way to learn.

## Define the outcome

Write the desired user/business outcome before the feature list. Define what success looks like and what would falsify the assumption.

## Scope the first useful slice

Select the smallest complete experience that can deliver or test the intended outcome. “MVP” means minimum viable outcome, not intentionally broken UX, insecure implementation, missing recovery paths, or fake completeness.

## Prioritize

Consider impact, evidence strength, urgency, risk reduction, learning value, effort, dependencies and opportunity cost. Use established prioritization methods when helpful, but do not mechanically apply one scoring formula across unrelated projects.

## Measure

Choose a small set of meaningful outcome metrics plus guardrail/counter-metrics. Avoid optimizing a proxy that can improve while user value declines.

## Iterate

After release or experiment, compare expected versus observed behavior. Keep, change, defer, or discard based on evidence. Feed learning back into requirements, UX, architecture, and roadmap decisions.

## Anti-patterns

Never inflate scope to make an MVP look impressive. Never treat stakeholder preference as user evidence. Never optimize vanity metrics at the expense of outcomes. Never let product speed bypass mandatory security, privacy, accessibility, reliability, or legal requirements.

## Source lineage
Source IDs used for this skill: YC-SKILLS, PRODUCTSKILLS, IIBA-BABOK, SKILLS-SH, SUPERPOWERS.

jona/ycombinator-skills, assimovt/productskills, IIBA BABOK, plus workflow patterns from obra/superpowers and Everything Claude Code.
