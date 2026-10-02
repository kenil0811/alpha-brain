import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AvatarBoot, isAvatarWindow } from "./avatar/boot";
import "./styles/app.css";
import { Button } from "./ui/Button";

/** A window that went blank tells nobody anything: any error that escapes rendering is shown
 *  in the window with a way back. */
class Guard extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    // One line for the person; the stack goes to the console, never on screen.
    console.error(error);
    return { error: error instanceof Error ? error.message : String(error) };
  }
  render() {
    if (this.state.error) {
      return (
        <section className="page page--crash stack" role="alert">
          <h2>Alpha's window hit a problem</h2>
          <p className="notice">{this.state.error}</p>
          <Button onClick={() => window.location.reload()}>
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
      <Guard>{avatar ? <AvatarBoot /> : <App />}</Guard>
    </React.StrictMode>,
  );
});
