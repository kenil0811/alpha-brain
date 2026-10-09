import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { stepBack, useStepBack, type PanelStep } from "./stepBack";

const step = (over: Partial<PanelStep> = {}): PanelStep => ({ folded: false, wide: false, narrow: vi.fn(), fold: vi.fn(), ...over });

function Frame({ rail, panel, children }: { rail: PanelStep; panel: PanelStep; children?: React.ReactNode }) {
  useStepBack(rail, panel);
  return (
    <>
      <nav className="rail">
        <button>In the sidebar</button>
      </nav>
      <main>
        <button>In the page</button>
        <input aria-label="A field in the page" />
      </main>
      <aside className="assist">
        <button>In the panel</button>
        <textarea aria-label="Composer" />
      </aside>
      {children}
    </>
  );
}
const escape = (el: Element) => fireEvent.keyDown(el, { key: "Escape" });

describe("Escape steps a panel back", () => {
  it("one level at a time: wide → normal → folded, then nothing", () => {
    const wide = step({ wide: true });
    stepBack(wide);
    expect(wide.narrow).toHaveBeenCalled();
    expect(wide.fold).not.toHaveBeenCalled();
    const normal = step();
    stepBack(normal);
    expect(normal.fold).toHaveBeenCalled();
    const folded = step({ folded: true });
    stepBack(folded);
    expect(folded.fold).not.toHaveBeenCalled();
    expect(folded.narrow).not.toHaveBeenCalled();
  });

  it("applies to the panel the focus is in, and to none when the focus is in the page", () => {
    const rail = step({ wide: true });
    const panel = step();
    render(<Frame rail={rail} panel={panel} />);
    escape(screen.getByRole("button", { name: "In the sidebar" }));
    expect(rail.narrow).toHaveBeenCalledTimes(1);
    expect(panel.fold).not.toHaveBeenCalled();
    escape(screen.getByRole("button", { name: "In the panel" }));
    expect(panel.fold).toHaveBeenCalledTimes(1);
    escape(screen.getByRole("button", { name: "In the page" }));
    expect(rail.narrow).toHaveBeenCalledTimes(1);
    expect(panel.fold).toHaveBeenCalledTimes(1);
  });

  it("leaves an Escape that belongs to something else alone", () => {
    const panel = step();
    const { unmount } = render(<Frame rail={step()} panel={panel} />);
    // a field with something typed in it may be cancelling that
    const composer = screen.getByRole("textbox", { name: "Composer" });
    fireEvent.change(composer, { target: { value: "half a thought" } });
    escape(composer);
    expect(panel.fold).not.toHaveBeenCalled();
    fireEvent.change(composer, { target: { value: "" } });
    escape(composer);
    expect(panel.fold).toHaveBeenCalledTimes(1);
    unmount();

    // an open dialog or menu takes it
    const again = step();
    render(
      <Frame rail={step()} panel={again}>
        <div role="dialog" aria-label="Open dialog" />
      </Frame>,
    );
    escape(screen.getByRole("button", { name: "In the panel" }));
    expect(again.fold).not.toHaveBeenCalled();
  });
});
