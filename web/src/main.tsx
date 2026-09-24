import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";
// ADR 0005: the look comes from the Design System mirror, linked straight from design/ds/.
import "../../design/ds/styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
