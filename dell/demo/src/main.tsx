import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { WorldProvider } from "./data/store";
import { ThemeProvider } from "./shell/theme";
import "./styles/tokens.css";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <WorldProvider>
        <App />
      </WorldProvider>
    </ThemeProvider>
  </StrictMode>,
);
