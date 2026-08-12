// ─────────────────────────────────────────────────────────────────────────────
// main.tsx — React application entry point.
// Mounts the root <App /> component into #root inside React.StrictMode.
// ─────────────────────────────────────────────────────────────────────────────
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
