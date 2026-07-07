# Login left-panel: "someone's already in here" board

Two self-contained, animated SVGs for the empty left side of the login/auth page. They show a live collaboration board (teammate cursors drifting, a sticky note, a brand-palette card, a task card with a live selection, and a review comment) so the panel says "a team is working in here" instead of sitting blank.

- `collab-board-example.svg` — light (warm editorial, deep forest green)
- `collab-board-example-dark.svg` — dark (warm charcoal, deep green, cream sticky)

They are **examples/references**, meant to be adjusted.

## How to use

These live in `/design` (reference only, not web-served). To actually use them, either **move them to `/public`** or inline the `<svg>` into a component.

**Simplest (as an image), after moving to `/public`:**
```tsx
<img src="/collab-board-example.svg" alt="" className="h-full w-full object-cover" />
```
`object-cover` lets the 560×680 art fill any panel height. The cursors animate on their own (SMIL) — no JS, no CSS.

**Light + dark by theme** — two images toggled by scheme, or swap `src` from your theme state:
```tsx
<img src="/collab-board-example.svg"      alt="" className="h-full w-full object-cover dark:hidden" />
<img src="/collab-board-example-dark.svg" alt="" className="h-full w-full object-cover hidden dark:block" />
```

## Adjusting it (it's an example)

- **Colors are hardcoded hex** — swap for the real design tokens. Green is `#1b5e3f` (light) / `#45996f` (dark). Keep the green **deep, not neon**, in both themes — that is what reads editorial instead of generic.
- **Sticky font** uses `Caveat` with a system-script fallback; load the Caveat webfont for the proper handwritten look.
- **Names/colors** of the three cursors (Vasu green, Julian grey, Aria terracotta) and the copy on the sticky/task/comment are all editable text in the SVG.

## Upgrade path (optional, later)

To show **real** teammates instead of decoration: inline the `<svg>` into a component and drive each cursor group's `transform` (position) + label text from live Supabase presence. The three `<g>` cursor blocks near the bottom of the file are where you'd bind that.
