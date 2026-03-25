import { scan } from "react-scan";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./global.css";
import Router from "./pages/router";

scan({
  enabled: true,
});
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router />
  </StrictMode>,
);
