---
name: frontend-dark-polish
description: Trustfolio GAS codebase-specific UI polish for HTML/CSS only. Use when editing or beautifying Trustfolio screens under src/ui/*.html (Index.html, styles.html, scripts.html) with dark-mode styling, layout refinement, typography upgrades, or visual hierarchy improvements.
---

# Frontend Dark Polish (Trustfolio GAS)

## Overview

Improve Trustfolio GAS screens with a consistent dark-mode visual system while preserving existing structure and behavior. Apply changes only to HTML/CSS unless explicitly asked to modify JS.

## Scope

- Target files: src/ui/Index.html, src/ui/styles.html, src/ui/scripts.html.
- Keep existing layout semantics; do not change data flow or API calls.
- Prefer incremental polish over full redesign unless explicitly requested.

## Workflow

1. Inspect current UI structure and CSS tokens in src/ui/styles.html.
2. Introduce or update a dark theme token set (CSS variables).
3. Adjust typography, spacing, and grouping for clearer hierarchy.
4. Add depth with layered surfaces and subtle borders/shadows.
5. Improve focus/hover/disabled states for clarity and accessibility.
6. Validate mobile layout and ensure no contrast regressions.

## Implementation Rules

- Use CSS variables for all colors and spacing.
- Avoid pure black; use near-black backgrounds for comfort.
- Keep contrast high for primary text and inputs.
- Use purposeful fonts; avoid default stacks.
- Do not add new JS behaviors unless requested.
- Preserve existing class names to avoid breaking scripts.

## Output Expectations

- Update src/ui/styles.html with dark theme variables and component styles.
- Update src/ui/Index.html only when layout needs minor structure tweaks.
- Keep src/ui/scripts.html unchanged unless explicitly requested.

## References

- Dark theme tokens: references/dark-theme-tokens.md
- UI polish checklist: references/ui-polish-checklist.md
