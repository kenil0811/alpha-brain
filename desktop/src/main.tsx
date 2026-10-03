import { Button, TooltipProvider } from "./ui";
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AvatarBoot, isAvatarWindow } from "./avatar/boot";
import "./styles/app.css";

/** A window that went blank tells nobody anything: any error that escapes rendering is shown
 *  in the window with a way back. */
class Guard extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error) };
  }
  render() {
    if (this.state.error) {
      return (
        <section className="page" role="alert" style={{ padding: 24 }}>
          <h2>Alpha's window hit a problem</h2>
          <p className="muted">Reload to carry on; nothing you saved is affected.</p>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, userSelect: "text" }}>{this.state.error}</pre>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </section>
      );
    }
    return this.props.children;
  }
}

const container = document.getElementById("root");
if (!container) throw new Error("missing #root");
const root = createRoot(container);
void isAvatarWindow().then((avatar) => {
  root.render(
    <React.StrictMode>
      <TooltipProvider>
        <Guard>{avatar ? <AvatarBoot /> : <App />}</Guard>
      </TooltipProvider>
    </React.StrictMode>,
  );
});
