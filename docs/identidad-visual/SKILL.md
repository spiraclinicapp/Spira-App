---
name: spira-design
description: Use this skill to generate well-branded interfaces and assets for Spira, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI components for prototyping the Spira clinical-research ecosystem.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

Key building blocks:
- `colors_and_type.css` — design tokens (color, type, radii, shadows, spacing).
- `SpiraVilanos.jsx` (`Vilano1`) and `assets/spira-vilano-*.svg` — the vilano isotype.
- `Icons.jsx` — Lucide line-icon set.
- `spiraTokens.jsx`, `spiraShared2.jsx`, `FinalShell.jsx`, `PharmaContent.jsx` — the app shell + module content.
- `App Shell — Final.html` and `Manual de Marca.html` — reference renders.

Identity in one line: **petrol `#0F5F57` on warm paper `#F4F1EA`, Schibsted Grotesk + Hanken Grotesk, sober and clean, the dandelion-seed (vilano) as the mark, one accent color per module.** No emoji; line icons only; voseo in Spanish copy.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.
