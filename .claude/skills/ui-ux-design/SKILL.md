---
name: ui-ux-design
description: Design, redesign, critique, or validate interfaces and user journeys across web, mobile, desktop, embedded, and other interactive products. Use when users ask for a better UI/UX, new flows, design systems, usability, accessibility, responsive behavior, or visual polish.
---

# UI/UX Design Engineering

Design for understanding, task success, accessibility, consistency, feedback, recovery, and appropriate visual quality. The existing product, users, content, and platform determine the style; do not impose a trend.

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

## Discover first

Inspect existing screens, components, content, navigation, visual language, responsive behavior, interaction states, analytics/evidence where available, and user goals. Reuse healthy patterns and identify inconsistency before inventing new ones.

## Design the task, not the screen

Model:
- user goal
- entry point and context
- primary action
- information hierarchy
- decision points
- confirmation and feedback
- loading/empty/error/offline states
- recovery and undo where appropriate
- completion signal

Minimize cognitive load without hiding necessary information.

## Establish a system

Prefer a coherent design language: typography hierarchy, spacing rhythm, color roles, surfaces, interaction states, icons, component behavior, motion, content conventions, and responsive adaptation. Choose values from the project's brand, platform conventions, accessibility needs, content density, and established design system—not a universal pixel recipe.

## Accessibility

Target WCAG 2.2 at the level appropriate to the project; for general public products, prefer at least AA unless another requirement governs. Cover semantic structure, keyboard access, focus behavior, names/labels, contrast, reflow, target sizing, reduced motion, forms, errors, status messages, and assistive-technology compatibility. Treat accessibility as product quality, not a last-minute audit.

## Visual quality

Use hierarchy, alignment, whitespace, contrast, scale, rhythm, restraint, and meaningful imagery. Avoid gratuitous gradients, glass effects, motion, decorative density, or novelty unless they improve the intended experience.

## Validate visually and behaviorally

For substantial changes, test representative viewports/devices and important states. Prefer user-task validation and specific critique over subjective “looks good.” For existing UI, identify the highest-impact defects first, then polish.

## Source lineage
Source IDs used for this skill: ANTHROPIC-SKILLS, VERCEL-SKILLS, PRODUCTSKILLS, YC-SKILLS, WCAG-2-2, WEB-VITALS, ISO-25010, SKILLS-SH.

Anthropic Agent Skills, vercel-labs/agent-skills, jona/ycombinator-skills, assimovt/productskills, W3C WCAG 2.2, Google Web Vitals, ISO/IEC 25010:2023. Use community design skills as optional taste/reference sources, not authority.
