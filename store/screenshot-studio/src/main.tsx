// FILE: store/screenshot-studio/src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Dashboard } from "./dashboard";
import { RenderView } from "./render-view";
import { FONT_FACES } from "./theme";
import "./styles.css";

const style = document.createElement("style");
style.textContent = FONT_FACES;
document.head.appendChild(style);

const params = new URLSearchParams(window.location.search);
const root = createRoot(document.getElementById("root")!);

if (params.has("render")) {
  // No StrictMode here: a doubled effect would race the readiness flag the export waits on.
  document.body.classList.add("render-mode");
  root.render(<RenderView deviceId={params.get("device") ?? "iphone-6.9"} slideIndex={Number(params.get("slide") ?? "0")} />);
} else {
  root.render(
    <StrictMode>
      <Dashboard />
    </StrictMode>,
  );
}
