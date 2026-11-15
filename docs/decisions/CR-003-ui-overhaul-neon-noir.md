# CR-003: UI overhaul, "Neon Noir" theme (black, neon violet, glass, motion)

| Field | Value |
|---|---|
| Raised by | Kartik (lead), after reviewing the live deploy on 2026-11-15 |
| Date | 2026-11-15 |
| Status | Approved (lead's instruction) |
| Affects | design system (tokens, components, motion); no data contract changes |
| Files | `web/src/styles/tokens.css`, `web/src/app/globals.css`, `web/src/app/layout.tsx`, `web/src/app/template.tsx`, `web/src/components/**`, page headers in `web/src/app/**`, `docs/design-system.md` |
| Tasks affected | Parts 5–9 (visual layer only) |

## Problem

The live site reads as a plain admin page, not a polished control tower:

- the navy base and cyan accent, with blue as the AI series colour, make everything look blue;
- panels are flat boxes with 1 px grey borders, with no depth, glass or hover feedback;
- there is almost no motion (`motion` is a dependency but is not used anywhere);
- the type hierarchy is weak: small headers, small KPI numbers and no display face;
- the controls (sliders, toggles, tabs, presets) are browser defaults with a tint.

## Proposed change

**1. Palette ("Neon Noir").**
- Plane: true black `#030305`, with a slow-drifting violet and fuchsia aurora, a masked dot grid and grain behind the content.
- Chrome accent: violet `#a78bfa`, with strong `#8b5cf6`, deep `#6d28d9`, fuchsia `#e879f9` and pink `#f472b6`. The brand gradient runs violet → fuchsia → pink.
- Ink: `#f5f2fb`, `#c8c0d8` and `#948ba6`. On the darkest and lightest glass the ratios are 16.2–19.0, 10.2–12.0 and 5.2–6.5 to 1.
- Chart categorical palette, re-validated with the dataviz validator: dark mode, surfaces `#0a0710` and `#1a1426`, all five checks pass.
  - The slots are AI `#9d6bff`, baseline `#d4702c`, true demand `#129a79`, then `#b58c16`, `#de5596`, `#4e9a2b`, `#3b90dc` and `#e05c4c`.
  - The entity mapping is unchanged (AI = 1, baseline = 2, true demand = 3), and only slot 7 is blue.
- Sequential ramp: violet, `#ede4ff` to `#5733ad` (ordinal checks pass on both surfaces). Diverging: violet / grey `#3a3446` / coral.
- Status: green, amber, orange and red, brightened for black: `#22c55e`, `#fbbf24`, `#fb8a5a` and `#f5525a`. Still always shown with an icon and a label.

**2. Glass.**
- Panels: translucent gradient glass with backdrop blur and saturation, a 1 px gradient border (violet → transparent → fuchsia), an inner top highlight and a deep shadow.
- A cursor-following spotlight lights the border and the surface. It is pure CSS layers driven by two custom properties, set by one passive pointer listener.
- Chart panels stay inside the validated surface range.

**3. Motion: CSS first, plus Motion (formerly Framer Motion) where it helps.**
- **What animates:**
  - a route transition (`app/template.tsx`);
  - staggered header, grid and KPI entrances;
  - a highlight that springs between nav links and tabs (`Glide.tsx`, measured position plus spring-curve transitions);
  - a spring entrance for the Scenario Console and a Motion `motion/mini` exit (Web Animations API);
  - KPI numbers that count up (triggered by Motion `inView`), and KPI tiles that lift on hover;
  - chart frames that reveal on scroll (Motion `inView`);
  - chart lines that draw in, bars that grow, a glow on the AI line and a pulsing recommended marker;
  - live-ops stockout cells that pulse, and alerts that slide in;
  - a slow auto-rotation of the route globe.
- **Implementation finding:** Motion's React layer (`m`, `LazyMotion`, `AnimatePresence`) added about 49 KB gzip to every route and pushed six routes past the 300 KB hard limit, even with `domAnimation` features. It was replaced by CSS and Motion's vanilla APIs (about 2 KB). Routes are now 221–254 KB.
- **Reduced motion:** everything respects `prefers-reduced-motion`.

**4. Typography.** Space Grotesk for display text and numbers; Inter for body text. Headers are larger, with a gradient wordmark and eyebrow labels.

**5. Components.**
- A floating glass pill navigation inside the same 64 px bar (no sidebar, as before).
- A shared `PageHeader`.
- Custom range sliders (gradient track, glowing thumb), gradient toggles, pill segmented presets, glass tables with hover rows, and glass tooltips.

## Impact

- **Contracts and data:** no change to data contracts, data files or the pipeline. `CONTRACT_VERSION` is unchanged.
- **Tokens and design system:** `tokens.css` changes (this CR), and `docs/design-system.md` is updated to match.
- **Tests:** the existing e2e checks still apply (64 px bar, no horizontal scroll, no console errors, axe AA, JS budget).
- **Risks:**
  - Initial JS: mitigated by lazy motion features.
  - Contrast on gradient text: kept to light stops only.
  - Blur cost on low-end devices: one blur layer per panel, with a solid fallback and `prefers-reduced-transparency`.

## Alternatives considered

- **Re-tint the old tokens only:** it fixes the colour but not the flatness, the lack of motion or the hierarchy the lead asked for.
- **Add a component library (for example shadcn, Tremor):** new dependencies (frozen) and more JS, and the charts are custom SVG anyway.

## Lead decision

Approved, 2026-11-15: the lead asked for a full UI/UX overhaul with a black base, neon violet and purple, glassmorphism, Framer Motion animation and hover effects.
