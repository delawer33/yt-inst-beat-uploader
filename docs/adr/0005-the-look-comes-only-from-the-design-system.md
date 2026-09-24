---
status: accepted
date: 2026-09-24
---

# The look comes only from the Design System; the app carries no styles of its own

Every colour, size, font, radius, shadow and component class the app uses comes from the
Design System, whose canonical copy is the "Beat Upload" project in Claude Design. The
repository keeps a mirror of it in `design/ds/` and the frontend links that `styles.css`
directly. Components use its classes (`.btn-primary`, `.beat-card`, `.panel`); Tailwind stays
for layout glue only (flex, grid, gap), never for colour, radius or type. Anything visual that
is missing is added to the Design System and pushed back, not written locally.

The alternative was to keep the shadcn/ui + Tailwind token layer and translate the Design
System into it by hand. Every change in Claude Design would then need a manual port and the
two would drift; with one shared stylesheet, "changed in the design" and "changed in the app"
are the same edit.

## Consequences

- Mockups drawn in Claude Design are built from the same classes, so a screen can be lifted
  from a Mockup into a component with no restyling.
- shadcn/ui, class-variance-authority and the Radix primitives are removed as the components
  are rewritten.
- The token lint changes meaning: no hex, no colour or radius utilities outside `design/ds/`.
