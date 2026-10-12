import { Button, TooltipProvider } from "./ui";
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AvatarBoot, isAvatarWindow } from "./avatar/boot";
import { macTitleBar, startTitleBar } from "./shell/titleBar";
import "./styles/app.css";
import "./styles/data.css";
import "./styles/shell.css";
import "./styles/intel.css";

/** A window that went blank tells nobody anything: any error that escapes rendering leaves a
 *  plain sentence and Reload; the error itself goes to the console, not to the person. */
class Guard extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("Alpha's window hit a problem", error, info.componentStack);
  }
  render() {
    if (this.state.failed) {
      return (
        <section className="page" role="alert">
          <h2>Alpha's window hit a problem</h2>
          <p className="muted">Reload to carry on; nothing you saved is affected.</p>
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
  if (!avatar && macTitleBar()) startTitleBar();
  root.render(
    <React.StrictMode>
      <TooltipProvider>
        <Guard>{avatar ? <AvatarBoot /> : <App />}</Guard>
      </TooltipProvider>
    </React.StrictMode>,
  );
});
