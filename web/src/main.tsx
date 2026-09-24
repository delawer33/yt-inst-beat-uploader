import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";
// ADR 0005: the look comes from the Design System mirror, linked straight from design/ds/.
//
// CASCADE RULE — read before mixing a Design System class with Tailwind utilities.
// This sheet is imported unlayered, while every Tailwind utility lives in @layer utilities.
// Unlayered CSS beats any layer, at any specificity, so a DS class always wins over a
// Tailwind utility that sets the same property. `className="beat-grid flex gap-2"` renders
// as a grid with the DS gap; `className="panel hidden"` stays visible. There is no build
// error and no lint hit for either.
//
// Working rule: a DS class owns every property it sets; Tailwind may only add properties
// the DS class does not set. If you need a property the DS class already sets, change it in
// the Design System (design/ds/ + the Design project), not with a utility here.
import "../../design/ds/styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
