# CSS Modules Migration Guide

This file defines the Stage 0 migration baseline for replacing inline styles with CSS Modules.

## Conventions

- Create a co-located stylesheet next to each component: `Component.module.css`.
- Import module styles as `import styles from './Component.module.css'`.
- Prefer semantic class names (`overlay`, `panel`, `row`, `button`) over visual names.
- Prefer CSS pseudo-classes (`:hover`, `:focus-visible`, `:disabled`) over event handlers mutating `element.style`.
- Keep all colors theme-safe by using existing CSS variables (`var(--shade*)`, `var(--accent*)`, `var(--cable-*)`).
- Keep styling decisions in CSS; keep runtime state decisions in TS/TSX via conditional classes/data attributes.

## Allowed Inline-Style Exceptions

Inline styles are still allowed when they are runtime-driven and impractical to represent as finite classes:

1. Geometry values derived at runtime (for example: absolute position, dimensions, transform scale).
2. Animation/perf hot paths that update every frame via refs (`requestAnimationFrame` meter fills, indicator dots).
3. Imperative SVG path updates needed for cable rendering/preview performance.
4. Theme token injection in `ThemeProvider` (`root.style.setProperty(...)`).

Everything else should be migrated to CSS Modules.

## Audit Commands

- `npm run styles:audit:inline`
- `npm run styles:audit:imperative`
- `npm run styles:audit`

These commands are intentionally simple and broad; during migration, review each hit and either:

- convert it to CSS Modules, or
- keep it as an explicit exception per the list above.
